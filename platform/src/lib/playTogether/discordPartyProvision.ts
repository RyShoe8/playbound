/**
 * PlayBound → Discord bot: temporary party voice channels.
 *
 * Mirrors the event voice provisioning pattern in discordEventProvision.ts.
 * Soft-fails when the bot webhook is unset or unreachable so the party
 * system works without Discord deployed.
 */

import type { Document } from "mongoose";

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
      signal: AbortSignal.timeout(12_000),
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
      (party as Record<string, unknown>).discord = {};
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
    console.warn("discord party voice provision error", err);
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
      signal: AbortSignal.timeout(12_000),
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
