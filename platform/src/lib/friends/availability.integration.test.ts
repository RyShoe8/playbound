import { checkInviteRecipient } from "@/lib/playTogether/invites";
import { PATCH as savePreferences } from "@/app/api/friends/availability/route";
import { POST as sendFriendMessage } from "@/app/api/friends/message/route";
import Notification from "@/lib/models/Notification";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";
import PlayAvailability from "@/lib/models/PlayAvailability";
import { availabilityForFriends } from "./availabilityService";
import { createPlatformEvent } from "@/lib/events/service";
import PlatformEvent from "@/lib/models/PlatformEvent";
import Presence from "@/lib/models/Presence";
import { getLookingToPartyCounts, listLookingToParty } from "@/lib/playTogether/lookingToParty";
import { POST as stopLooking } from "@/app/api/presence/lfg/route";
import { sweepStalePresence } from "@/lib/presence/server";
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/playTogether/sharedGames", () => ({ listSharedLibraryByFriend: async () => ({}) }));
vi.mock("@/lib/catalog", () => ({ getGame: async () => ({ slug: "openra", features: ["Multiplayer"] }), listGames: async () => [{ slug: "openra", title: "OpenRA" }] }));
vi.mock("@/lib/friendsAuth", () => ({ getFriendsUserId: async () => owner }));
vi.mock("@/lib/multiplayer/activity", () => ({ revalidateMultiplayerActivity: vi.fn() }));
let mongo: MongoMemoryServer;
let owner: string;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "availability-test" });
  const users = await User.collection.insertMany([
    { username: "owner", email: "owner@example.test" },
    { username: "friend", email: "friend@example.test" },
    { username: "offline", email: "offline@example.test", preferences: { appearOffline: true } },
    { username: "hidden", email: "hidden@example.test", preferences: { hideActivityFromFriends: true } },
    { username: "pending", email: "pending@example.test" },
    { username: "blocked", email: "blocked@example.test" },
    { username: "stranger", email: "stranger@example.test" },
  ]);
  const ids = Object.values(users.insertedIds); owner = String(ids[0]);
  await Friend.collection.insertMany(ids.slice(1, 6).map((id, index) => ({ requesterId: ids[0], recipientId: id, status: index < 3 ? "accepted" : index === 3 ? "pending" : "blocked" })));
  await PlayAvailability.collection.insertMany(ids.map(userId => ({ userId, timezone: "America/Chicago", window: null, weekly: [{ day: 1, startMinute: 1140, endMinute: 1320 }] })));
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
it("only exposes accepted friends who share activity, never pending, blocked or unrelated users", async () => {
  const result = await availabilityForFriends(owner);
  expect(result.friends.map(friend => friend.username)).toEqual(["friend"]);
  expect(result.availability.weekly).toEqual([{ day: 1, startMinute: 1140, endMinute: 1320 }]);
  expect(result.friends[0].availability.timezone).toBe("America/Chicago");
});
it("upserts one record per person without changing user or friendship data", async () => {
  await PlayAvailability.updateOne({ userId: owner }, { $set: { timezone: "UTC", window: null, weekly: [] } }, { upsert: true });
  await PlayAvailability.updateOne({ userId: owner }, { $set: { timezone: "UTC", window: null, weekly: [] } }, { upsert: true });
  expect(await PlayAvailability.countDocuments({ userId: owner })).toBe(1);
  expect(await User.countDocuments()).toBe(7);
  expect(await Friend.countDocuments()).toBe(5);
});
it("creates a normal unlisted event without publishing a public listing", async () => {
  const event = await createPlatformEvent({ title: "Friends Game Night", description: "", gameSlug: "openra", eventType: "game_night", hostType: "community", visibility: "unlisted", startsAt: new Date(Date.now() + 3600_000).toISOString(), endsAt: new Date(Date.now() + 7200_000).toISOString(), timezone: "America/Chicago" }, owner);
  expect(event.visibility).toBe("unlisted");
  expect(String(event.organizerId)).toBe(owner);
  expect(event.generatedBy).toBe(null);
  expect(await PlatformEvent.countDocuments({ visibility: { $ne: "unlisted" } })).toBe(0);
  expect(await User.countDocuments()).toBe(7);
});
it("lists only opted-in active windows, deduplicates manual LFG, and removes expired users", async () => {
  const now = Date.now();
  const users = await User.collection.insertMany([
    { username: "scheduled", email: "scheduled@example.test" },
    { username: "private", email: "private@example.test" },
    { username: "dual", email: "dual@example.test" },
    { username: "expired", email: "expired@example.test" },
    { username: "future", email: "future@example.test" },
    { username: "hidden-scheduled", email: "hidden-scheduled@example.test", preferences: { appearOffline: true } },
  ]);
  const ids = Object.values(users.insertedIds);
  await PlayAvailability.collection.insertMany(ids.map((userId, index) => ({ userId, timezone: "UTC", publishLooking: index !== 1, weekly: [], window: { startsAt: new Date(index === 4 ? now + 3600_000 : now - 3600_000), endsAt: new Date(index === 3 ? now - 1 : now + 7200_000) } })));
  await Presence.collection.insertOne({ userId: ids[2], lookingForPlayersUntil: new Date(now + 3600_000), lookingForPlayersGameIds: ["openra"] });
  expect(await getLookingToPartyCounts()).toEqual({ total: 2, byGame: { openra: 1 } });
  expect((await listLookingToParty()).map(player => player.username).sort()).toEqual(["dual", "scheduled"]);
  await PlayAvailability.updateOne({ userId: ids[0] }, { $set: { "window.endsAt": new Date(now - 1) } });
  expect(await getLookingToPartyCounts()).toEqual({ total: 1, byGame: { openra: 1 } });
});
it("Stop Looking disables automatic listing without deleting the saved window", async () => {
  const startsAt = new Date(Date.now() - 60_000), endsAt = new Date(Date.now() + 3600_000);
  await PlayAvailability.updateOne({ userId: owner }, { $set: { publishLooking: true, window: { startsAt, endsAt } } });
  const response = await stopLooking(new Request("https://test/api/presence/lfg", { method: "POST", body: JSON.stringify({ enabled: false }) }));
  expect(response.status).toBe(200);
  const saved = await PlayAvailability.findOne({ userId: owner }).lean();
  expect(saved?.publishLooking).toBe(false);
  expect(new Date(saved!.window.endsAt).getTime()).toBe(endsAt.getTime());
});
it("keeps Looking to Party active after a browser heartbeat expires", async () => {
  const now = new Date();
  const user = await User.collection.insertOne({ username: "stale-lfg", email: "stale-lfg@example.test" });
  await Presence.collection.insertOne({
    userId: user.insertedId,
    status: "online",
    lastHeartbeat: new Date(now.getTime() - 60 * 60_000),
    lookingForPlayersUntil: new Date(now.getTime() + 30 * 60_000),
    lookingForPlayersGameId: "openra",
    lookingForPlayersGameIds: ["openra"],
  });
  await sweepStalePresence(now);
  const saved = await Presence.findOne({ userId: user.insertedId }).lean();
  expect(saved?.status).toBe("offline");
  expect(saved?.lookingForPlayersGameIds).toEqual(["openra"]);
  expect(new Date(saved!.lookingForPlayersUntil!).getTime()).toBeGreaterThan(now.getTime());
  expect((await listLookingToParty()).some(player => player.username === "stale-lfg")).toBe(true);
});
it("reuses a scheduled friends party when the organizer retries the same start time", async () => {
  const start = Date.now() + 3600000;
  const input = { title: "Play together with friends", description: "", plannedParty: true,
    eventType: "party", hostType: "community" as const, visibility: "unlisted" as const, startsAt: new Date(start).toISOString() };
  const first = await createPlatformEvent(input, owner);
  const second = await createPlatformEvent(input, owner);
  expect(String(first._id)).toBe(String(second._id));
  expect(first.visibility).toBe("unlisted");
  expect(first.generatedBy).toBe(null);
  await expect(createPlatformEvent({ ...input, startsAt: new Date(start + 6 * 3600000).toISOString() }, owner)).rejects.toThrow("six hours");
});

it("saves matching choices separately from the user's availability window", async () => {
  const data = { mode: "genres", genres: ["Strategy"], games: [], downloads: true };
  const before = await PlayAvailability.findOne({userId: owner}).lean();
  const response = await savePreferences(new Request("https://test/api/friends/availability", { method: "PATCH", body: JSON.stringify(data) }));
  expect(response.status).toBe(200);
  const after = await PlayAvailability.findOne({userId: owner}).lean();
  expect(after?.preferences).toEqual(data);
  expect(after?.weekly).toEqual(before?.weekly);
  expect(after?.window).toEqual(before?.window);
});
it("delivers a friend note to the recipient and rejects unrelated accounts", async () => {
  const friend = await User.findOne({username: "friend"}).lean();
  const stranger = await User.findOne({username: "stranger"}).lean();
  const send = (id: unknown) => sendFriendMessage(new Request("https://test/api/friends/message", {
    method:"POST", body:JSON.stringify({friendId:String(id),message:"Ready for a game?"})
  }));
  expect((await send(friend!._id)).status).toBe(200);
  expect((await send(stranger!._id)).status).toBe(403);
  expect(await Notification.countDocuments({userId:friend!._id,type:"friend_message",body:"Ready for a game?"})).toBe(1);
});

it("matches public nonfriends while excluding private, hidden, self and blocked accounts", async () => {
  const names = ["stranger", "blocked", "offline", "hidden"];
  const people = await User.find({username: {$in:names}}).lean();
  await PlayAvailability.updateMany({userId: {$in: people.map(p=>p._id)}}, {$set: {publishLooking:true, weekly:[], window:{startsAt:new Date(), endsAt:new Date(Date.now()+3600000)}}});
  const result = await availabilityForFriends(owner);
  expect(result.matchCandidates.map(p=>p.username)).toContain("stranger");
  expect(result.matchCandidates.map(p=>p.username)).not.toEqual(expect.arrayContaining(["blocked"]));
  expect(result.matchCandidates.some(p=>["offline","hidden","owner"].includes(p.username))).toBe(false);
  expect(result.friends.map(p=>p.username)).not.toContain("stranger");
});

it("allows contact with opted-in nonfriends, rejects blocked and private recipients", async () => {
  const stranger = await User.findOne({username:"stranger"}).lean();
  const blocked = await User.findOne({username:"blocked"}).lean();
  expect(await checkInviteRecipient(owner, String(stranger!._id))).toEqual({ok:true});
  expect(await checkInviteRecipient(owner, String(blocked!._id))).toMatchObject({status:403});
  await PlayAvailability.updateOne({userId:stranger!._id}, {$set:{publishLooking:false}});
  expect(await checkInviteRecipient(owner, String(stranger!._id))).toMatchObject({status:403});
});
