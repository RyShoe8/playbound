import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import PlayAvailability from "@/lib/models/PlayAvailability";
import { type Availability, emptyAvailability } from "./availability";
import { listSharedLibraryByFriend } from "@/lib/playTogether/sharedGames";

export function serializeAvailability(doc: { timezone?: string; window?: { startsAt: Date; endsAt: Date } | null; weekly?: Availability["weekly"] } | null, now = Date.now()): Availability {
  if (!doc) return emptyAvailability();
  return { timezone: doc.timezone || "UTC", window: doc.window && new Date(doc.window.endsAt).getTime() > now ? { startsAt: new Date(doc.window.startsAt).toISOString(), endsAt: new Date(doc.window.endsAt).toISOString() } : null, weekly: (doc.weekly || []).map(({ day, startMinute, endMinute }) => ({ day, startMinute, endMinute })) };
}

export async function availabilityForFriends(userId: string) {
  await dbConnect();
  const relationships = await Friend.find({ status: "accepted", $or: [{ requesterId: userId }, { recipientId: userId }] }).select("requesterId recipientId").lean();
  const ids = relationships.map(row => String(row.requesterId) === userId ? String(row.recipientId) : String(row.requesterId));
  const [users, records, shared] = await Promise.all([
    User.find({ _id: { $in: ids }, disabled: { $ne: true }, "preferences.appearOffline": { $ne: true }, "preferences.hideActivityFromFriends": { $ne: true } }).select("username").lean(),
    PlayAvailability.find({ userId: { $in: [userId, ...ids] } }).lean(),
    listSharedLibraryByFriend(userId, ids),
  ]);
  const byId = new Map(records.map(record => [String(record.userId), serializeAvailability(record)]));
  return { availability: byId.get(userId) || emptyAvailability(), friends: users.map(user => ({ id: String(user._id), username: String(user.username), availability: byId.get(String(user._id)) || emptyAvailability(), sharedGames: shared[String(user._id)] || [] })).sort((a, b) => a.username.localeCompare(b.username)) };
}
