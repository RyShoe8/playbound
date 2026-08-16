/**
 * PlayBound → Discord bot: temporary party voice channels.
 *
 * Mirrors the event voice provisioning pattern in discordEventProvision.ts.
 * Soft-fails when the bot webhook is unset or unreachable so the party
 * system works without Discord deployed.
 */

import type { Document } from "mongoose";
import DiscordConnection from "@/lib/models/DiscordConnection";

type PartyLike = Document & {
  _id: { toString(): string };
  gameSlug: string;
  discord?: {
    voiceChannelId?: string | null;
    textChannelId?: string | null;
    categoryId?: string | null;
    inviteUrl?: string | null;
    provisionedAt?: Date | null;
    cleanedAt?: Date | null;
  };
  save: () => Promise<unknown>;
};

function botConfig() {
  const url = process.env.DISCORD_BOT_WEBHOOK_URL?.replace(/\/$/, "");
  const secret =
    process.env.BOT_WEBHOOK_SECRET || process.env.DISCORD_BOT_WEBHOOK_SECRET;
  return { url, secret };
}

export async function provisionPartyDiscordVoice(
  party: PartyLike
): Promise<boolean> {
  const { url, secret } = botConfig();
  if (!url || !secret) return false;

  try {
    const res = await fetch(`${url}/parties/voice`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        partyId: String(party._id),
        gameSlug: party.gameSlug,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.warn("discord party voice provision failed", res.status);
      return false;
    }

    const data = (await res.json()) as {
      inviteUrl?: string;
      voiceChannelId?: string;
      categoryId?: string;
    };

    if (!party.discord) {
      (party as any).discord = {};
    }
    const discord = party.discord!;
    if (data.inviteUrl) discord.inviteUrl = data.inviteUrl;
    if (data.voiceChannelId) discord.voiceChannelId = data.voiceChannelId;
    if (data.categoryId) discord.categoryId = data.categoryId;
    discord.provisionedAt = new Date();
    discord.cleanedAt = null;
    await party.save();
    return true;
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.warn(
      timedOut ? "discord party voice provision timeout" : "discord party voice provision error",
      err
    );
    return false;
  }
}

export async function cleanupPartyDiscordVoice(
  party: PartyLike
): Promise<boolean> {
  const { url, secret } = botConfig();
  if (!url || !secret) return false;

  const discord = party.discord;
  if (!discord?.voiceChannelId) {
    if (discord) {
      discord.cleanedAt = new Date();
      await party.save();
    }
    return true;
  }

  try {
    const res = await fetch(`${url}/parties/voice/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        partyId: String(party._id),
        voiceChannelId: discord.voiceChannelId,
        categoryId: discord.categoryId,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.warn("discord party voice cleanup failed", res.status);
      return false;
    }

    discord.cleanedAt = new Date();
    await party.save();
    return true;
  } catch (err) {
    console.warn("discord party voice cleanup error", err);
    return false;
  }
}

export type PartyVoiceFollowup = {
  needsDiscordLink: boolean;
  inviteUrl: string | null;
  moved: boolean;
};

export async function moveDiscordUsersToPartyVoice(
  party: PartyLike,
  discordUserIds: string[]
): Promise<{ moved: number }> {
  const { url, secret } = botConfig();
  const voiceChannelId = party.discord?.voiceChannelId;
  if (!url || !secret || !voiceChannelId || discordUserIds.length === 0) {
    return { moved: 0 };
  }
  try {
    const res = await fetch(`${url}/parties/voice/move`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ voiceChannelId, discordUserIds }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.warn("discord party voice move failed", res.status);
      return { moved: 0 };
    }
    const data = (await res.json()) as { moved?: number };
    return { moved: Number(data.moved) || 0 };
  } catch (err) {
    console.warn("discord party voice move error", err);
    return { moved: 0 };
  }
}

/** Create the party voice channel if needed, then move this member when Discord is linked. */
export async function syncPartyVoiceForMember(
  party: PartyLike,
  userId: string
): Promise<PartyVoiceFollowup> {
  if (!party.discord?.voiceChannelId || party.discord.cleanedAt) {
    await provisionPartyDiscordVoice(party);
  }
  const inviteUrl = party.discord?.inviteUrl || null;
  const conn = await DiscordConnection.findOne({ userId }).select("discordId").lean();
  if (!conn?.discordId) {
    return { needsDiscordLink: true, inviteUrl, moved: false };
  }
  const { moved } = await moveDiscordUsersToPartyVoice(party, [String(conn.discordId)]);
  return { needsDiscordLink: false, inviteUrl, moved: moved > 0 };
}
