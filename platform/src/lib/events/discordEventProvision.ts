/**
 * PlayBound → Discord bot temporary event voice channels.
 * Soft-fails when the bot webhook is unset or unreachable.
 *
 * Events follow the same channel lifecycle as parties (see
 * playTogether/discordPartyProvision.ts): the channel is named after the
 * event and renamed when the event is, it lives in a shared Event Rooms category
 * while no game is chosen, and it moves into the game's area once one is.
 */

import type { Document } from "mongoose";
import DiscordConnection from "@/lib/models/DiscordConnection";
import PlatformEvent from "@/lib/models/PlatformEvent";

type EventLike = Document & {
  _id: { toString(): string };
  title: string;
  gameSlug?: string | null;
  organizerId?: unknown;
  createdBy?: unknown;
  discordInviteUrl?: string | null;
  discordVoiceChannelId?: string | null;
  discordTextChannelId?: string | null;
  discordCategoryId?: string | null;
  discordVoiceProvisionedAt?: Date | null;
  discordVoiceProvisioningAt?: Date | null;
  discordVoiceCleanedAt?: Date | null;
  save: () => Promise<unknown>;
};

const PROVISION_CLAIM_STALE_MS = 60_000;

function botConfig() {
  const rawUrl = process.env.DISCORD_BOT_WEBHOOK_URL?.trim();
  const url = rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))
    ? rawUrl.replace(/\/$/, "")
    : null;
  const secret = process.env.BOT_WEBHOOK_SECRET || process.env.DISCORD_BOT_WEBHOOK_SECRET;
  if (!url || !secret) return { url: null, secret: null };
  return { url, secret };
}

function isManuallyCreated(event: EventLike): boolean {
  return Boolean(event.organizerId || event.createdBy);
}

/** True when this caller won the race to provision; false if another caller holds the lock or already finished. */
async function claimEventDiscordProvision(eventId: string): Promise<"claimed" | "already_ready" | "busy"> {
  const fresh = await PlatformEvent.findById(eventId)
    .select("discordVoiceChannelId discordVoiceCleanedAt discordVoiceProvisioningAt")
    .lean<{
      discordVoiceChannelId?: string | null;
      discordVoiceCleanedAt?: Date | null;
      discordVoiceProvisioningAt?: Date | null;
    } | null>();
  if (!fresh) return "busy";
  if (fresh.discordVoiceChannelId && !fresh.discordVoiceCleanedAt) return "already_ready";

  const staleBefore = new Date(Date.now() - PROVISION_CLAIM_STALE_MS);
  const claimed = await PlatformEvent.findOneAndUpdate(
    {
      _id: eventId,
      discordVoiceChannelId: null,
      discordVoiceCleanedAt: null,
      $or: [
        { discordVoiceProvisioningAt: null },
        { discordVoiceProvisioningAt: { $lt: staleBefore } },
      ],
    },
    { $set: { discordVoiceProvisioningAt: new Date() } },
    { new: true }
  )
    .select("_id")
    .lean();
  return claimed ? "claimed" : "busy";
}

async function clearProvisionClaim(eventId: string): Promise<void> {
  await PlatformEvent.updateOne(
    { _id: eventId },
    { $set: { discordVoiceProvisioningAt: null } }
  );
}

async function hydrateEventFromDb(event: EventLike): Promise<boolean> {
  const fresh = await PlatformEvent.findById(event._id)
    .select(
      "discordInviteUrl discordVoiceChannelId discordTextChannelId discordCategoryId discordVoiceProvisionedAt discordVoiceCleanedAt"
    )
    .lean<{
      discordInviteUrl?: string | null;
      discordVoiceChannelId?: string | null;
      discordTextChannelId?: string | null;
      discordCategoryId?: string | null;
      discordVoiceProvisionedAt?: Date | null;
      discordVoiceCleanedAt?: Date | null;
    } | null>();
  if (!fresh?.discordVoiceChannelId || fresh.discordVoiceCleanedAt) return false;
  event.discordInviteUrl = fresh.discordInviteUrl ?? event.discordInviteUrl;
  event.discordVoiceChannelId = fresh.discordVoiceChannelId;
  event.discordTextChannelId = fresh.discordTextChannelId ?? event.discordTextChannelId;
  event.discordCategoryId = fresh.discordCategoryId ?? event.discordCategoryId;
  event.discordVoiceProvisionedAt = fresh.discordVoiceProvisionedAt ?? event.discordVoiceProvisionedAt;
  return true;
}

export async function provisionEventDiscordVoice(
  event: EventLike
): Promise<boolean> {
  const { url, secret } = botConfig();
  if (!url || !secret) return false;

  const eventId = String(event._id);
  if (event.discordVoiceChannelId && !event.discordVoiceCleanedAt) return true;

  const claim = await claimEventDiscordProvision(eventId);
  if (claim === "already_ready") {
    await hydrateEventFromDb(event);
    return Boolean(event.discordVoiceChannelId);
  }
  if (claim === "busy") {
    // Another caller is provisioning — wait briefly and adopt their result.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    return hydrateEventFromDb(event);
  }

  try {
    const res = await fetch(`${url}/events/voice`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        eventId,
        title: event.title,
        // Decides the category up front, so an event created with a game
        // never has to be moved afterwards.
        gameSlug: event.gameSlug || null,
        // Planner pop-ups already post via /events/announce — skip #events gathering.
        announceEventsChannel: isManuallyCreated(event),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn("discord event voice provision failed", res.status);
      await clearProvisionClaim(eventId);
      return false;
    }
    const data = (await res.json()) as {
      inviteUrl?: string;
      voiceChannelId?: string;
      textChannelId?: string;
      categoryId?: string;
    };
    if (data.inviteUrl) event.discordInviteUrl = data.inviteUrl;
    if (data.voiceChannelId) event.discordVoiceChannelId = data.voiceChannelId;
    if (data.textChannelId) event.discordTextChannelId = data.textChannelId;
    if (data.categoryId) event.discordCategoryId = data.categoryId;
    event.discordVoiceProvisionedAt = new Date();
    event.discordVoiceProvisioningAt = null;
    await event.save();
    return true;
  } catch (err) {
    console.warn("discord event voice provision error", err);
    await clearProvisionClaim(eventId);
    // Timed out after Discord created rooms — another attempt or concurrent
    // caller may already have saved channel IDs.
    if (await hydrateEventFromDb(event)) return true;
    return false;
  }
}

/** Retry short-lived bot/API failures without waiting for the next cron tick. */
export async function provisionEventDiscordVoiceWithRetry(
  event: EventLike,
  attempts = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (event.discordVoiceChannelId && !event.discordVoiceCleanedAt) return true;
    if (await hydrateEventFromDb(event)) return true;
    if (await provisionEventDiscordVoice(event)) return true;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      if (await hydrateEventFromDb(event)) return true;
    }
  }
  return false;
}

export type EventVoiceFollowup = {
  needsDiscordLink: boolean;
  inviteUrl: string | null;
  moved: boolean;
  inEventVoice: boolean;
};

/**
 * Match party Launch Voice: ensure the room exists, then move a linked member
 * who is already connected to voice; otherwise return the room invite.
 */
export async function syncEventVoiceForMember(
  event: EventLike,
  userId: string
): Promise<EventVoiceFollowup> {
  if (!event.discordVoiceChannelId || event.discordVoiceCleanedAt) {
    await provisionEventDiscordVoice(event);
  }

  const inviteUrl = event.discordInviteUrl || null;
  const conn = await DiscordConnection.findOne({ userId }).select("discordId").lean();
  if (!conn?.discordId) {
    return { needsDiscordLink: true, inviteUrl, moved: false, inEventVoice: false };
  }

  const { url, secret } = botConfig();
  if (!url || !secret || !event.discordVoiceChannelId) {
    return { needsDiscordLink: false, inviteUrl, moved: false, inEventVoice: false };
  }

  try {
    // The bot's move operation is channel-generic; this is the same operation
    // used by Party Launch Voice.
    const res = await fetch(`${url}/parties/voice/move`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        voiceChannelId: event.discordVoiceChannelId,
        discordUserIds: [String(conn.discordId)],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { needsDiscordLink: false, inviteUrl, moved: false, inEventVoice: false };
    }
    const data = (await res.json()) as { moved?: number; alreadyThere?: number };
    const moved = Number(data.moved) > 0;
    return {
      needsDiscordLink: false,
      inviteUrl,
      moved,
      inEventVoice: moved || Number(data.alreadyThere) > 0,
    };
  } catch (err) {
    console.warn("discord event voice move error", err);
    return { needsDiscordLink: false, inviteUrl, moved: false, inEventVoice: false };
  }
}

/** Renames the event's channels to follow its new title. */
export async function renameEventDiscordVoice(event: EventLike): Promise<boolean> {
  const { url, secret } = botConfig();
  const voiceChannelId = event.discordVoiceChannelId;
  const textChannelId = event.discordTextChannelId;
  if (!url || !secret) return false;
  if (!voiceChannelId && !textChannelId) return false;
  if (event.discordVoiceCleanedAt) return false;

  try {
    const res = await fetch(`${url}/events/voice/rename`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        eventId: String(event._id),
        title: event.title,
        voiceChannelId,
        textChannelId,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn("discord event voice rename failed", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("discord event voice rename error", err);
    return false;
  }
}

/**
 * Moves the event's channels into its game's area, or back to the shared
 * Event Rooms category when the game is cleared. Unlike the party equivalent there
 * is no one-shot guard: an event's game can change more than once, and the
 * channel has to follow it each time.
 */
export async function placeEventDiscordVoice(event: EventLike): Promise<boolean> {
  const { url, secret } = botConfig();
  const voiceChannelId = event.discordVoiceChannelId;
  const textChannelId = event.discordTextChannelId;
  if (!url || !secret) return false;
  if (!voiceChannelId && !textChannelId) return false;
  if (event.discordVoiceCleanedAt) return false;

  try {
    const res = await fetch(`${url}/events/voice/place`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        gameSlug: event.gameSlug || null,
        voiceChannelId,
        textChannelId,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn("discord event voice place failed", res.status);
      return false;
    }
    const data = (await res.json()) as { categoryId?: string };
    if (data.categoryId) {
      event.discordCategoryId = data.categoryId;
      await event.save();
    }
    return true;
  } catch (err) {
    console.warn("discord event voice place error", err);
    return false;
  }
}

export async function cleanupEventDiscordVoice(
  event: EventLike
): Promise<boolean> {
  const { url, secret } = botConfig();
  if (!url || !secret) return false;
  if (!event.discordVoiceChannelId && !event.discordTextChannelId) {
    event.discordVoiceCleanedAt = new Date();
    await event.save();
    return true;
  }
  try {
    const res = await fetch(`${url}/events/voice/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        eventId: String(event._id),
        voiceChannelId: event.discordVoiceChannelId,
        textChannelId: event.discordTextChannelId,
        categoryId: event.discordCategoryId,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn("discord event voice cleanup failed", res.status);
      return false;
    }
    event.discordVoiceCleanedAt = new Date();
    await event.save();
    return true;
  } catch (err) {
    console.warn("discord event voice cleanup error", err);
    return false;
  }
}
