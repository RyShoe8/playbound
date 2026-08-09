/**
 * Extension point: PlayBound → Discord bot temporary event voice channels.
 * Soft-fails when the bot webhook is unset or unreachable.
 *
 * Future: parties / automated lobby rooms can reuse these hooks without
 * inventing a second Discord integration path.
 */

import type { Document } from "mongoose";

type EventLike = Document & {
  _id: { toString(): string };
  title: string;
  discordInviteUrl?: string | null;
  discordVoiceChannelId?: string | null;
  discordTextChannelId?: string | null;
  discordCategoryId?: string | null;
  discordVoiceProvisionedAt?: Date | null;
  discordVoiceCleanedAt?: Date | null;
  save: () => Promise<unknown>;
};

function botConfig() {
  const url = process.env.DISCORD_BOT_WEBHOOK_URL?.replace(/\/$/, "");
  const secret = process.env.BOT_WEBHOOK_SECRET || process.env.DISCORD_BOT_WEBHOOK_SECRET;
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
      }),
      signal: AbortSignal.timeout(12_000),
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
