import Presence from "@/lib/models/Presence";
import PlayAvailability from "@/lib/models/PlayAvailability";
import { emptyAvailability, type Availability } from "./availability";
import { defaultPlayPreferences, nextPlayTime } from "./playPreferences";

/** Public schedules and explicit Looking to Party signals, never private windows. */
export async function publicAvailability(recipientId?: string, now = Date.now()) {
  const scope = recipientId ? { userId: recipientId } : {};
  const [schedules, manual] = await Promise.all([
    PlayAvailability.find({ ...scope, publishLooking: true, $or: [
      { "window.endsAt": { $gt: new Date(now) }, "window.startsAt": { $lte: new Date(now + 6 * 3600000) } },
      { "weekly.0": { $exists: true } },
    ] }).lean(),
    Presence.find({ ...scope, lookingForPlayersUntil: { $gt: new Date(now) } })
      .select("userId lookingForPlayersUntil lookingForPlayersGameId lookingForPlayersGameIds").lean(),
  ]);
  const manualPreferences = new Map((manual.length ? await PlayAvailability.find({ userId: { $in: manual.map(row => row.userId) } }).select("userId preferences").lean() : [])
    .map(row => [String(row.userId), row.preferences]));
  const result = new Map<string, { availability: Availability; preferences: typeof defaultPlayPreferences }>();
  for (const row of schedules) {
    const availability: Availability = { timezone: row.timezone || "UTC", publishLooking: true,
      weekly: row.weekly || [], window: row.window && new Date(row.window.endsAt).getTime() > now
        ? { startsAt: new Date(row.window.startsAt).toISOString(), endsAt: new Date(row.window.endsAt).toISOString() } : null };
    if (nextPlayTime(availability, now, now + 6 * 3600000)) {
      result.set(String(row.userId), { availability, preferences: row.preferences || defaultPlayPreferences });
    }
  }
  for (const row of manual) {
    const id = String(row.userId);
    const existing = result.get(id);
    const wanted = row.lookingForPlayersGameIds?.length ? row.lookingForPlayersGameIds : row.lookingForPlayersGameId ? [row.lookingForPlayersGameId] : [];
    result.set(id, { availability: { ...(existing?.availability || emptyAvailability()), publishLooking: true,
      window: { startsAt: new Date(now).toISOString(), endsAt: new Date(row.lookingForPlayersUntil).toISOString() } },
    preferences: wanted.length ? { ...(manualPreferences.get(id) || defaultPlayPreferences), mode: "games", games: wanted.map(String) } : existing?.preferences || manualPreferences.get(id) || defaultPlayPreferences });
  }
  return result;
}
