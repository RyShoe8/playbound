/**
 * Cached Discord guild widget presence (≈5 minutes).
 * Requires the server widget to be enabled in Discord settings.
 */

type Presence = { online?: number; members?: number; name?: string; invite?: string };

const cache = new Map<string, { at: number; data: Presence | null }>();
const TTL_MS = 5 * 60 * 1000;

export async function getDiscordPresence(guildId?: string | null): Promise<Presence | null> {
  if (!guildId) return null;
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      cache.set(guildId, { at: Date.now(), data: null });
      return null;
    }
    const json = (await res.json()) as {
      name?: string;
      presence_count?: number;
      members?: unknown[];
      instant_invite?: string;
    };
    const data: Presence = {
      name: json.name,
      online: json.presence_count,
      members: Array.isArray(json.members) ? json.members.length : undefined,
      invite: json.instant_invite,
    };
    cache.set(guildId, { at: Date.now(), data });
    return data;
  } catch {
    cache.set(guildId, { at: Date.now(), data: null });
    return null;
  }
}
