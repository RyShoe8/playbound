import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";
import Party from "@/lib/models/Party";
import PlayAvailability from "@/lib/models/PlayAvailability";
import LibraryEntry from "@/lib/models/LibraryEntry";
import Presence from "@/lib/models/Presence";
import Notification from "@/lib/models/Notification";
import PlayTogetherLease from "@/lib/models/PlayTogetherLease";
import { defaultPlayPreferences } from "@/lib/friends/playPreferences";
import { matchAvailablePlayers } from "./availabilityMatching";

vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/realtime/partyVersion", () => ({ bumpPartyVersion: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ getGame: async () => ({ slug: "openra", title: "OpenRA" }), listGames: async () => [{ slug: "openra", title: "OpenRA", genres: ["Strategy"], features: ["Multiplayer"], launchMethods: ["install"] }] }));
vi.mock("./party", () => ({ createParty: async (options: { userId: string; gameSlug: string; editionSlug?: string; availabilityMatch: unknown }) => {
  const doc = await Party.create({ leaderId: options.userId, members: [{ userId: options.userId, role: "leader" }],
    gameSlug: options.gameSlug, editionSlug: options.editionSlug, visibility: "public", status: "forming", availabilityMatch: options.availabilityMatch });
  return { party: { id: String(doc._id) }, status: 201 };
} }));

let mongo: MongoMemoryServer;
let ids: string[];
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "play-together-matching-test" });
  await Notification.init();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  for (const model of [User, Friend, Party, PlayAvailability, LibraryEntry, Presence, Notification, PlayTogetherLease]) await model.deleteMany({});
  const users = await User.collection.insertMany([{ username: "Alex", email: "alex@example.test" }, { username: "Blake", email: "blake@example.test" }]);
  ids = Object.values(users.insertedIds).map(String);
  await PlayAvailability.create(ids.map(userId => ({ userId, timezone: "UTC", publishLooking: true,
    preferences: defaultPlayPreferences, window: { startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000) } })));
  await LibraryEntry.create(ids.map(userId => ({ userId, gameSlug: "openra", installed: true, editionSlug: "ra" })));
});

it("matches unrelated available players, sends both the same party link, and never duplicates on retries", async () => {
  expect((await matchAvailablePlayers()).partiesCreated).toBe(1);
  const notices = await Notification.find().lean();
  expect(notices).toHaveLength(2);
  expect(new Set(notices.map(n => n.href)).size).toBe(1);
  expect(notices.every(n => n.meta.actions.includes("join"))).toBe(true);
  expect(new Set(notices.map(n => String(n.userId)))).toEqual(new Set(ids));
  const party = await Party.findOne().lean();
  expect(party?.editionSlug).toBe("ra");
  expect(party?.members).toHaveLength(1); // The other player joins by clicking; never auto-enrolled.
  await matchAvailablePlayers();
  expect(await Notification.countDocuments()).toBe(2);
  expect(await Party.countDocuments()).toBe(1);
});
it("serializes simultaneous manual saves and cron workers", async () => {
  await Promise.all([matchAvailablePlayers(), matchAvailablePlayers(), matchAvailablePlayers()]);
  expect(await Party.countDocuments()).toBe(1);
  expect(await Notification.countDocuments()).toBe(2);
});
it("repairs a partially delivered pair using its persisted party journal", async () => {
  await matchAvailablePlayers();
  await Notification.deleteOne({ userId: ids[1] });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(1);
  expect(await Notification.countDocuments()).toBe(2);
  expect(await Party.countDocuments()).toBe(1);
});
it("matches recurring windows in their timezone without a launcher heartbeat", async () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find(p => p.type === "weekday")!.value);
  const minute = Number(parts.find(p => p.type === "hour")!.value) * 60 + Number(parts.find(p => p.type === "minute")!.value);
  await PlayAvailability.updateMany({}, { $set: { window: null, timezone: "America/Chicago", weekly: [{ day, startMinute: minute, endMinute: Math.min(1440, minute + 60) }] } });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(2);
});
it("also matches manual Looking to Party signals through the same worker", async () => {
  await PlayAvailability.updateMany({}, { $set: { publishLooking: false } });
  await Presence.create(ids.map(userId => ({ userId, lookingForPlayersUntil: new Date(Date.now() + 3600000), lookingForPlayersGameIds: ["openra"] })));
  expect((await matchAvailablePlayers()).notificationsSent).toBe(2);
});
it.each(["private", "future", "expired", "offline", "hidden", "invites-off", "notifications-off", "blocked", "wrong-genre", "wrong-edition"])("does not notify a %s pair", async condition => {
  const id = ids[1];
  if (condition === "private") await PlayAvailability.updateOne({ userId: id }, { $set: { publishLooking: false } });
  if (condition === "future") await PlayAvailability.updateOne({ userId: id }, { $set: { "window.startsAt": new Date(Date.now() + 60000) } });
  if (condition === "expired") await PlayAvailability.updateOne({ userId: id }, { $set: { "window.endsAt": new Date(Date.now() - 1) } });
  const pref = { offline: "appearOffline", hidden: "hideActivityFromFriends", "invites-off": "allowPlayInvites", "notifications-off": "notifyFriendActivity" }[condition];
  if (pref) await User.updateOne({ _id: id }, { $set: { [`preferences.${pref}`]: !condition.endsWith("-off") } });
  if (condition === "blocked") await Friend.create({ requesterId: id, recipientId: ids[0], status: "blocked" });
  if (condition === "wrong-genre") await PlayAvailability.updateOne({ userId: id }, { $set: { preferences: { ...defaultPlayPreferences, mode: "genres", genres: ["Racing"] } } });
  if (condition === "wrong-edition") await LibraryEntry.updateOne({ userId: id }, { $set: { editionSlug: "td" } });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(0);
  expect(await Party.countDocuments()).toBe(0);
});
it("reuses a forming public party and notifies both the host and matched player", async () => {
  const party = await Party.create({ leaderId: ids[0], members: [{ userId: ids[0], role: "leader" }], status: "forming", visibility: "public", gameSlug: "openra", editionSlug: "ra" });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(2);
  expect(await Party.countDocuments()).toBe(1);
  expect((await Notification.find().lean()).every(n => n.href === `/party/${party.id}`)).toBe(true);
  await matchAvailablePlayers();
  expect(await Notification.countDocuments()).toBe(2);
});
it("reuses an official-edition party for equivalent base-game installs", async () => {
  await LibraryEntry.updateMany({}, { $set: { editionSlug: "official" } });
  const party = await Party.create({ leaderId: ids[0], members: [{ userId: ids[0], role: "leader" }], status: "forming", visibility: "public", gameSlug: "openra", editionSlug: "official" });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(2);
  expect((await Notification.find().lean()).every(n => n.href === `/party/${party.id}`)).toBe(true);
});
it.each([{status:"playing",visibility:"public"},{status:"forming",visibility:"invite_only"}])("never moves a player out of a $status $visibility party", async ({status,visibility}) => {
  await Party.create({ leaderId: ids[0], members: [{ userId: ids[0], role: "leader" }], status, visibility, gameSlug: "openra", editionSlug: "ra" });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(0);
  expect(await Party.countDocuments()).toBe(1);
});
it("the real creation primitive refuses to replace a membership acquired during matching", async () => {
  const party = await Party.create({ leaderId: ids[1], members: ids.map(userId => ({ userId, role: userId === ids[1] ? "leader" : "member" })), status: "forming", visibility: "friends" });
  const { createParty } = await import("./party/membership");
  const result = await createParty({ userId: ids[0], gameSlug: "openra", availabilityMatch: { key: "race", userIds: ids, expiresAt: new Date(Date.now() + 60000) } });
  expect(result).toEqual({ error: "You already have a party", status: 400 });
  expect((await Party.findById(party._id))?.members).toHaveLength(2);
  expect(await Party.countDocuments()).toBe(1);
});
it("respects an active lease and recovers after an interrupted worker's lease expires", async () => {
  await PlayTogetherLease.create({ _id: "availability", owner: "other-worker", until: new Date(Date.now() + 60000) });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(0);
  await PlayTogetherLease.updateOne({ _id: "availability" }, { $set: { until: new Date(Date.now() - 1) } });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(2);
  expect(await PlayTogetherLease.countDocuments()).toBe(0);
});
it("does not invite someone into a full party or a party with a blocked member", async () => {
  const third = new mongoose.Types.ObjectId();
  const party = await Party.create({ leaderId: ids[0], members: [{ userId: ids[0], role: "leader" }, { userId: third, role: "member" }], maxSize: 2, status: "forming", visibility: "public", gameSlug: "openra", editionSlug: "ra" });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(0);
  await Party.updateOne({ _id: party._id }, { $set: { maxSize: 4 } });
  await Friend.create({ requesterId: ids[1], recipientId: third, status: "blocked" });
  expect((await matchAvailablePlayers()).notificationsSent).toBe(0);
});
it("does not reopen a dismissed/ended match during the same availability window", async () => {
  await matchAvailablePlayers();
  await Party.updateMany({}, { $set: { status: "ended" } });
  expect((await matchAvailablePlayers()).partiesCreated).toBe(0);
  expect(await Notification.countDocuments()).toBe(2);
});
