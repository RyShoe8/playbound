/**
 * PlayBound → Discord bot temporary event voice channels.
 * Soft-fails when the bot webhook is unset or unreachable.
 *
 * Events follow the same channel lifecycle as parties (see
 * playTogether/discordPartyProvision.ts): the channel is named after the
 * event and renamed when the event is, it lives in a shared Events category
 * while no game is chosen, and it moves into the game's area once one is.
 */

import type { Document } from "mongoose";

type EventLike = Document & {
  _id: { toString(): string };
  title: string;
  gameSlug?: string | null;
  discordInviteUrl?: string | null;
  discordVoiceChannelId?: string | null;
  discordTextChannelId?: string | null;
  discordCategoryId?: string | null;
  discordVoiceProvisionedAt?: Date | null;
  discordVoiceCleanedAt?: Date | null;
  save: () => Promise<unknown>;
};

function botConfig() {
  const rawUrl = process.env.DISCORD_BOT_WEBHOOK_URL?.trim();
  const url = rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))
    ? rawUrl.replace(/\/$/, "")
    : null;
  const secret = process.env.BOT_WEBHOOK_SECRET || process.env.DISCORD_BOT_WEBHOOK_SECRET;
  if (!url || !secret) return { url: null, secret: null };
  return { url, secret };
}

export async function provisionEventDiscordVoice(
  event: EventLike
): Promise<boolean> {
  const { url, secret } = botConfig();
  if (!url || !secret) return false;
  try {
    const res = await fetch(`${url}/events/voice`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        eventId: String(event._id),
        title: event.title,
        // Decides the category up front, so an event created with a game
        // never has to be moved afterwards.
        gameSlug: event.gameSlug || null,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn("discord event voice provision failed", res.status);
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
    await event.save();
    return true;
  } catch (err) {
    console.warn("discord event voice provision error", err);
    return false;
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
 * Events category when the game is cleared. Unlike the party equivalent there
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
