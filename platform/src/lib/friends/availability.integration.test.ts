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
import { getLookingToPartyCounts } from "@/lib/playTogether/lookingToParty";
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/playTogether/sharedGames", () => ({ listSharedLibraryByFriend: async () => ({}) }));
vi.mock("@/lib/catalog", () => ({ getGame: async () => ({ slug: "openra", features: ["Multiplayer"] }) }));
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
  await PlayAvailability.updateOne({ userId: ids[0] }, { $set: { "window.endsAt": new Date(now - 1) } });
  expect(await getLookingToPartyCounts()).toEqual({ total: 1, byGame: { openra: 1 } });
});
