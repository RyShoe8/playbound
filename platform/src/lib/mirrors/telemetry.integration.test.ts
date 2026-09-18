import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Artifact from "@/lib/models/Artifact";
import { recordDownloadTelemetry } from "./telemetry";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "mirror-telemetry-test" });
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("does not freeze the package size at a failed download's partial byte count", async () => {
  const input = {
    artifactId: "lost-alpha-size-regression", sourceId: "direct-catalog",
    sourceType: "public" as const, gameSlug: "stalker-lost-alpha",
    filename: "lostalphadc14007.zip", version: "1.4007",
    sourceUrl: "https://example.com/lostalphadc14007.zip",
  };
  await recordDownloadTelemetry({ ...input, result: "connection_error", bytesDownloaded: 512 * 1024 * 1024 });
  expect((await Artifact.findOne({ artifactId: input.artifactId }))?.sizeBytes).toBe(0);
  await recordDownloadTelemetry({ ...input, result: "success", bytesDownloaded: 7481363553 });
  expect((await Artifact.findOne({ artifactId: input.artifactId }))?.sizeBytes).toBe(7481363553);
});

it("does not register invalid bytes as package size even if result claims success", async () => {
  const artifactId = "invalid-checksum-size-regression";
  await recordDownloadTelemetry({
    artifactId, sourceId: "direct-catalog", sourceType: "public", result: "success",
    bytesDownloaded: 512 * 1024 * 1024, checksumValid: false,
  });
  expect((await Artifact.findOne({ artifactId }))?.sizeBytes).toBe(0);
});
