import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { purchaseClicksByGame } from "./purchaseClicks";

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "commerce-clicks-test" });
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("counts purchase-link clicks across stores and dates, excluding bots, giveaway claims and installs", async () => {
  await TelemetryEvent.collection.insertMany([
    { event: "purchase_clicked", properties: { gameSlug: "morrowind", retailer: "GOG" }, isBot: false },
    { event: "purchase_clicked", properties: { gameSlug: "morrowind", retailer: "Steam" }, createdAt: new Date("2025-01-01") },
    { event: "purchase_clicked", properties: { gameSlug: "morrowind", retailer: "GOG" }, isBot: true },
    { event: "purchase_clicked", properties: { gameSlug: "theme-hospital", retailer: "GOG" } },
    { event: "purchase_clicked", properties: { gameSlug: "unrelated" } },
    { event: "free_game_store_click", properties: { gameSlug: "morrowind" } },
    { event: "game_installed", properties: { gameSlug: "morrowind" } },
    { event: "purchase_clicked", properties: {} },
  ]);
  const counts = await purchaseClicksByGame(["morrowind", "theme-hospital", "zero", "morrowind"]);
  expect(counts).toEqual(new Map([["morrowind", 2], ["theme-hospital", 1]]));
  expect(counts?.get("zero") ?? 0).toBe(0);
});

it("distinguishes unavailable data from a successful zero count", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const aggregate = vi.spyOn(TelemetryEvent, "aggregate").mockImplementationOnce(() => {
    throw new Error("Timed out");
  });
  try {
    expect(await purchaseClicksByGame(["morrowind"])).toBeNull();
  } finally {
    aggregate.mockRestore();
    warning.mockRestore();
  }
  expect(await purchaseClicksByGame([])).toEqual(new Map());
});
