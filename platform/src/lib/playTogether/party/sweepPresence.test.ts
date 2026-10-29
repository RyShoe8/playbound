import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));

import { handleUserPresenceEnded } from "./sweep";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "presence-ended-test" });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("checks ObjectId party membership without a cast error", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  await handleUserPresenceEnded(String(new Types.ObjectId()));
  expect(warning).not.toHaveBeenCalledWith("[party] handleUserPresenceEnded error:", expect.anything());
  warning.mockRestore();
});
