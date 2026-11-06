import { activityGameSlugs, friendActivity } from "./friendActivity";
import Presence from "@/lib/models/Presence";
import { applyPresenceFreshness } from "./presenceMask";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import CatalogGame from "@/lib/models/CatalogGame";
import { mongoVisibleFilter } from "@/lib/catalogStatus";
import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import PlayAvailability from "@/lib/models/PlayAvailability";
import { type Availability, emptyAvailability } from "./availability";
import { listSharedLibraryByFriend } from "@/lib/playTogether/sharedGames";

export function serializeAvailability(doc: { timezone?: string; window?: { startsAt: Date; endsAt: Date } | null; weekly?: Availability["weekly"]; publishLooking?: boolean } | null, now = Date.now()): Availability {
  if (!doc) return emptyAvailability();
  return { timezone: doc.timezone || "UTC", publishLooking: Boolean(doc.publishLooking), window: doc.window && new Date(doc.window.endsAt).getTime() > now ? { startsAt: new Date(doc.window.startsAt).toISOString(), endsAt: new Date(doc.window.endsAt).toISOString() } : null, weekly: (doc.weekly || []).map(({ day, startMinute, endMinute }) => ({ day, startMinute, endMinute })) };
}

async function recentGamesForUsers(ids: string[]) {
  const plays = await TelemetryEvent.aggregate<{ _id: string; games: string[] }>([
    { $match: { userId: { $in: ids }, createdAt: { $gte: new Date(Date.now() - 90 * 86400_000) },
      event: { $in: ["game_started", "edition_launched", "session_started"] }, "properties.gameSlug": { $type: "string" } } },
    { $group: { _id: { user: "$userId", slug: "$properties.gameSlug" }, lastPlayed: { $max: "$createdAt" } } },
    { $group: { _id: "$_id.user", games: { $topN: { n: 3, sortBy: { lastPlayed: -1, "_id.slug": 1 }, output: "$_id.slug" } } } },
  ]);
  const slugs = [...new Set(plays.flatMap(row => row.games))];
  const titles = slugs.length ? await CatalogGame.find({ ...mongoVisibleFilter(), slug: { $in: slugs } }).select("slug title").lean<{ slug: string; title: string }[]>() : [];
  const bySlug = new Map(titles.map(game => [game.slug, game.title]));
  return new Map(plays.map(row => [row._id, row.games.flatMap(slug => bySlug.has(slug) ? [bySlug.get(slug)!] : [])]));
}

export async function availabilityForFriends(userId: string) {
  await dbConnect();
  const relationships = await Friend.find({ status: "accepted", $or: [{ requesterId: userId }, { recipientId: userId }] }).select("requesterId recipientId").lean();
  const ids = relationships.map(row => String(row.requesterId) === userId ? String(row.recipientId) : String(row.requesterId));
  const [users, records, shared, presence] = await Promise.all([
    User.find({ _id: { $in: ids }, disabled: { $ne: true }, "preferences.appearOffline": { $ne: true }, "preferences.hideActivityFromFriends": { $ne: true } }).select("username").lean(),
    PlayAvailability.find({ userId: { $in: [userId, ...ids] } }).lean(),
    listSharedLibraryByFriend(userId, ids, true),
    Presence.find({ userId: { $in: ids } }).select("userId status lastHeartbeat currentGameId").lean<{userId: unknown; status: string; lastHeartbeat: Date; currentGameId?: string | null}[]>(),
  ]);
  const fresh = new Map(presence.map(p => [String(p.userId), applyPresenceFreshness(p)]));
  const online = new Set([...fresh].filter(([, p]) => p.status !== "offline").map(([id]) => id));
  const byId = new Map(records.map(record => [String(record.userId), serializeAvailability(record)]));
  const prefs = new Map(records.map(record => [String(record.userId), record.preferences]));
  const activitySlugs = [...new Set(users.flatMap(user => activityGameSlugs(fresh.get(String(user._id)), prefs.get(String(user._id)))))];
  const activityTitles = new Map(activitySlugs.length
    ? (await CatalogGame.find({ ...mongoVisibleFilter(), slug: { $in: activitySlugs } }).select("slug title").lean<{ slug: string; title: string }[]>()).map(game => [game.slug, game.title])
    : []);
  const recent = await recentGamesForUsers([userId, ...users.map(user => String(user._id))]);
  return { preferences: prefs.get(userId), recentGames: recent.get(userId) ?? [], availability: byId.get(userId) || emptyAvailability(), friends: users.map(user => ({ id: String(user._id), username: String(user.username), online: online.has(String(user._id)), ...friendActivity(fresh.get(String(user._id)), prefs.get(String(user._id)), activityTitles), preferences: prefs.get(String(user._id)), recentGames: recent.get(String(user._id)) ?? [], availability: byId.get(String(user._id)) || emptyAvailability(), sharedGames: shared[String(user._id)] || [] })).sort((a, b) => a.username.localeCompare(b.username)) };
}
