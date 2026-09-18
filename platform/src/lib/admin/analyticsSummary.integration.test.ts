import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { daysAgo } from "./analyticsPeriods";
import { computeAnalyticsSummary } from "./analyticsSummary";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "analytics-summary-test" });
  await TelemetryEvent.collection.insertMany([
    // Repeated events count separately; repeated identities count only once.
    { event: "page_view", sessionId: "s1", userId: "u1", createdAt: daysAgo(0), isBot: false },
    { event: "page_view", sessionId: "s1", userId: "u1", createdAt: daysAgo(0), isBot: false },
    // Older records without isBot must remain visible. Anonymous users are excluded.
    { event: "login", sessionId: "s2", userId: null, createdAt: daysAgo(0) },
    { event: "page_view", sessionId: "s1", userId: "u1", createdAt: daysAgo(8), isBot: false },
    { event: "page_view", sessionId: "s3", userId: "u3", createdAt: daysAgo(40), isBot: false },
    { event: "page_view", sessionId: "bot", userId: "bot", createdAt: daysAgo(0), isBot: true },
    { event: "page_view", sessionId: "bot", userId: "bot", createdAt: daysAgo(8), isBot: true },
    { event: "page_view", sessionId: "bot", userId: "bot", createdAt: daysAgo(40), isBot: true },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("keeps human counts and distinct identities correct in current and previous windows", async () => {
  const summary = await computeAnalyticsSummary(false);
  expect(summary).toMatchObject({
    eventsToday: 3, events7d: 3, events30d: 4,
    events7dPrev: 1, events30dPrev: 1,
    uniqueSessions7d: 2, identifiedUsers7d: 1,
    uniqueSessions7dPrev: 1, identifiedUsers7dPrev: 1,
  });
  expect(summary.topEvents).toEqual([
    { _id: "page_view", count: 2 }, { _id: "login", count: 1 },
  ]);
  expect(summary.dailyVolume.reduce((sum, row) => sum + row.count, 0)).toBe(4);
});

it("includes bots consistently across cards, previous periods and charts when requested", async () => {
  const summary = await computeAnalyticsSummary(true);
  expect(summary).toMatchObject({
    eventsToday: 4, events7d: 4, events30d: 6,
    events7dPrev: 2, events30dPrev: 2,
    uniqueSessions7d: 3, identifiedUsers7d: 2,
    uniqueSessions7dPrev: 2, identifiedUsers7dPrev: 2,
  });
  expect(summary.dailyVolume.reduce((sum, row) => sum + row.count, 0)).toBe(6);
});
