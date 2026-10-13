import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
vi.mock("@/lib/db", () => ({ default: async () => mongoose }));
vi.mock("@/lib/gameHost/client", () => ({ fetchGameHostMetrics: vi.fn(), listManagedHostRooms: vi.fn() }));
vi.mock("./playerQuery", () => ({ managedQueryKind: vi.fn(), queryManagedOccupancy: vi.fn() }));
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import ServerResourceSample from "@/lib/models/ServerResourceSample";
import ServerResourceCalibration from "@/lib/models/ServerResourceCalibration";
import { resetResourceCalibration } from "./calibration";
import { recordResourceSample } from "./samples";
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: "resource_calibration_test" });
  await Promise.all([CommunityServerProfile.init(), ServerResourceSample.init(), ServerResourceCalibration.init()]);
}, 60_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([CommunityServerProfile.deleteMany({}), ServerResourceSample.deleteMany({}), ServerResourceCalibration.deleteMany({})]);
});
const oldProfile = () => CommunityServerProfile.create({ key: "teeworlds:base", gameSlug: "teeworlds", recipeSlug: "teeworlds",
  enabled: true, rotationEligible: true, queryVerified: true, verification: "testing", baselineVersion: 1,
  envelope: { cpuCores: 11.18, ramBytes: 256 * 1024 ** 2 }, sampleCount: 2826 });

describe("scoped resource calibration reset", () => {
  it("rolls back the estimates and archive if raw-sample removal fails", async () => {
    await oldProfile();
    const remove = vi.spyOn(ServerResourceSample, "deleteMany").mockImplementationOnce(() => { throw new Error("Deletion unavailable"); });
    await expect(resetResourceCalibration("admin", "reset-failed")).rejects.toThrow("Deletion unavailable");
    remove.mockRestore();
    expect((await CommunityServerProfile.findOne({ key: "teeworlds:base" }).lean())?.envelope.cpuCores).toBe(11.18);
    expect(await ServerResourceCalibration.countDocuments({ requestId: "reset-failed" })).toBe(0);
  });
  it("archives estimates, removes only old resource rows, and preserves unrelated data and eligibility", async () => {
    await oldProfile();
    await ServerResourceSample.create({ profileKey: "teeworlds:base", observedAt: new Date(), cpuCores: 7.45, ramBytes: 8e6, phase: "idle", source: "live" });
    const db = mongoose.connection.db!;
    for (const name of ["communityservers", "capacityreservations", "cataloggames", "communityhostingconfigs"]) {
      await db.collection(name).insertOne({ sentinel: name, settings: { unchanged: true } });
    }
    const before = await Promise.all(["communityservers", "capacityreservations", "cataloggames", "communityhostingconfigs"].map((name) => db.collection(name).find({}).toArray()));
    const result = await resetResourceCalibration("admin", "reset-one");
    expect(result).toMatchObject({ profiles: 1, removedSamples: 1, repeated: false });
    const profile = await CommunityServerProfile.findOne({ key: "teeworlds:base" }).lean();
    expect(profile).toMatchObject({ enabled: true, rotationEligible: true, queryVerified: true, verification: "testing",
      baselineVersion: 2, sampleCount: 0, envelope: { cpuCores: 0, ramBytes: 0 } });
    const archive = await ServerResourceCalibration.findOne({ requestId: "reset-one" }).lean();
    expect(archive?.profiles[0]).toMatchObject({ envelope: { cpuCores: 11.18 }, sampleCount: 2826 });
    const after = await Promise.all(["communityservers", "capacityreservations", "cataloggames", "communityhostingconfigs"].map((name) => db.collection(name).find({}).toArray()));
    expect(after).toEqual(before);
    expect(await resetResourceCalibration("admin", "reset-one")).toMatchObject({ repeated: true });
    expect((await CommunityServerProfile.findOne({ key: "teeworlds:base" }).lean())?.baselineVersion).toBe(2);
  });
  it("needs three valid readings, then records at most once a day and rejects obsolete reset samples", async () => {
    await oldProfile();
    await resetResourceCalibration("admin", "reset-two");
    const reading = { profileKey: "teeworlds:base", players: 0, cpuCores: 0.02, ramBytes: 8e6,
      nodeCpuCores: 6, sampleIntervalMs: 10_000, scope: "process-group", runtimeAgeMs: 600_000,
      phase: "idle" as const, source: "live" as const, observedAt: new Date(Date.now() + 1000) };
    expect(await recordResourceSample({ ...reading, cpuCores: 11.18 })).toBe(false);
    expect(await recordResourceSample({ ...reading, players: null })).toBe(false);
    expect(await recordResourceSample({ ...reading, observedAt: new Date(0) })).toBe(false);
    expect(await recordResourceSample(reading)).toBe(true);
    expect(await recordResourceSample(reading)).toBe(false);
    expect((await CommunityServerProfile.findOne({ key: reading.profileKey }).lean())?.envelope.cpuCores).toBe(0);
    for (const ms of [11_000, 22_000]) expect(await recordResourceSample({ ...reading, observedAt: new Date(reading.observedAt.getTime() + ms) })).toBe(true);
    expect((await CommunityServerProfile.findOne({ key: reading.profileKey }).lean())?.envelope.cpuCores).toBe(0.25);
    for (let i = 1; i < 50; i++) await recordResourceSample({ ...reading, observedAt: new Date(reading.observedAt.getTime() + 30_000 + i * 10_000) });
    expect(await ServerResourceSample.countDocuments({})).toBe(3);
    expect(await recordResourceSample({ ...reading, observedAt: new Date(reading.observedAt.getTime() + 86_400_000) })).toBe(true);
    expect(await ServerResourceSample.countDocuments({})).toBe(4);
  });
  it("stores spawn evidence separately without raising normal usage or its count", async () => {
    await oldProfile(); await resetResourceCalibration("admin", "reset-three");
    const sample = { profileKey: "teeworlds:base", observedAt: new Date(Date.now() + 1000), players: 0,
      cpuCores: 2, ramBytes: 100e6, phase: "startup" as const, source: "audit" as const };
    expect(await recordResourceSample(sample)).toBe(true);
    expect(await recordResourceSample({ ...sample, observedAt: new Date(Date.now() + 2000) })).toBe(false);
    expect((await CommunityServerProfile.findOne({ key: sample.profileKey }).lean())?.sampleCount).toBe(0);
  });
});
