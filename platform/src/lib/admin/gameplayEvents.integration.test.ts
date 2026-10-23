import { afterAll, beforeAll, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { GAMEPLAY_ID, PLAY_END_MATCH, PLAY_START_MATCH } from "./gameplayEvents";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "gameplay-editions-test" });
  await TelemetryEvent.collection.insertMany([
    { event: "edition_launched", anonymousId: "player-1", properties: { gameSlug: "daggerfall", editionSlug: "daggerfall-online", editionName: "Daggerfall Online", platform: "windows" } },
    { event: "game_started", anonymousId: "player-1", properties: { gameSlug: "daggerfall", platform: "launcher" } },
    { event: "game_ended", anonymousId: "player-1", properties: { gameSlug: "daggerfall", editionSlug: "daggerfall-online", durationMs: 600_000, platform: "windows" } },
    { event: "game_finished", anonymousId: "player-1", properties: { gameSlug: "daggerfall", durationMs: 600_000, platform: "launcher" } },
    { event: "edition_launched", anonymousId: "player-2", properties: { gameSlug: "daggerfall", editionSlug: "classic-dos", platform: "windows" } },
    { event: "game_ended", anonymousId: "player-2", properties: { gameSlug: "daggerfall", editionSlug: "classic-dos", durationMs: 300_000, platform: "windows" } },
    { event: "game_started", anonymousId: "player-3", properties: { gameSlug: "daggerfall", platform: "browser" } },
    { event: "game_finished", anonymousId: "player-3", properties: { gameSlug: "daggerfall", durationMs: 120_000, platform: "browser" } },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("counts each edition and base-game play separately without launcher renderer duplicates", async () => {
  const starts = await TelemetryEvent.aggregate<{
    _id: { gameSlug: string; editionSlug: string | null };
    count: number;
  }>([
    { $match: PLAY_START_MATCH },
    { $group: { _id: GAMEPLAY_ID, count: { $sum: 1 } } },
  ]);
  expect(starts.map((row) => [row._id.editionSlug, row.count]).sort()).toEqual([
    [null, 1],
    ["classic-dos", 1],
    ["daggerfall-online", 1],
  ].sort());

  const ends = await TelemetryEvent.aggregate<{
    _id: { gameSlug: string; editionSlug: string | null };
    totalMs: number;
  }>([
    { $match: PLAY_END_MATCH },
    { $group: { _id: GAMEPLAY_ID, totalMs: { $sum: "$properties.durationMs" } } },
  ]);
  expect(ends.map((row) => [row._id.editionSlug, row.totalMs]).sort()).toEqual([
    [null, 120_000],
    ["classic-dos", 300_000],
    ["daggerfall-online", 600_000],
  ].sort());
});
