import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Artifact from "@/lib/models/Artifact";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { registerVerifiedUploadedPackage, syncUploadedPackageArtifacts } from "./uploadedPackages";

const host = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/gameHost/client", () => ({ archivedArtifactStatusOnHost: host.status }));

let mongo: MongoMemoryServer;
const full = {
  gameSlug: "stalker-lost-alpha", version: "1.4007", filename: "lostalphadc14007.zip",
  relativePath: "launcher-packages/games/stalker-lost-alpha/1789348443595-lostalphadc14007.zip",
  sizeBytes: 7481363553,
};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "uploaded-packages-test" });
  await Artifact.init();
}, 120_000);
beforeEach(async () => {
  await Promise.all([Artifact.deleteMany({}), CatalogGame.deleteMany({}), Edition.deleteMany({})]);
  host.status.mockReset();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it("registers the exact archive idempotently without replacing the smaller add-on or cache policy", async () => {
  await Artifact.create({
    artifactId: "legacy-lar", gameSlug: full.gameSlug, version: full.version,
    filename: "LAR_v.1.0.7z", relativePath: "launcher-packages/games/stalker-lost-alpha/old-LAR_v.1.0.7z",
    sizeBytes: 537800370,
  });
  const first = await registerVerifiedUploadedPackage(full);
  expect(first).toMatchObject({ filename: full.filename, sizeBytes: full.sizeBytes, vpsStatus: "verified" });
  await Artifact.updateOne({ _id: first!._id }, { $set: { totalDownloads: 12, r2Protected: true, mirrorEnabled: true } });
  await registerVerifiedUploadedPackage(full);
  expect(await Artifact.countDocuments()).toBe(2);
  expect(await Artifact.findOne({ _id: first!._id })).toMatchObject({ totalDownloads: 12, r2Protected: true, mirrorEnabled: true });
  expect(await Artifact.findOne({ artifactId: "legacy-lar" })).toMatchObject({ filename: "LAR_v.1.0.7z", sizeBytes: 537800370 });
});

it("backfills a verified current upload and skips further host probes once registered", async () => {
  await CatalogGame.collection.insertOne({ slug: full.gameSlug, launcherInstall: {
    url: "https://mirror.playbound.club/" + full.relativePath, fileName: full.filename, versionLabel: full.version,
  } });
  host.status.mockResolvedValue({ status: "verified", sizeBytes: full.sizeBytes });
  await syncUploadedPackageArtifacts();
  expect(await Artifact.findOne({ relativePath: full.relativePath })).toMatchObject({ sizeBytes: full.sizeBytes, vpsStatus: "verified" });
  await syncUploadedPackageArtifacts();
  expect(host.status).toHaveBeenCalledTimes(1);
  expect(await Artifact.countDocuments()).toBe(1);
});

it("never registers a partial/unverified upload", async () => {
  await CatalogGame.collection.insertOne({ slug: full.gameSlug, launcherInstall: {
    url: "https://mirror.playbound.club/" + full.relativePath, fileName: full.filename,
  } });
  host.status.mockResolvedValue({ status: "uploading", bytesReceived: 512 * 1024 * 1024 });
  await syncUploadedPackageArtifacts();
  expect(await Artifact.countDocuments()).toBe(0);
});

it("registers an edition upload under its parent game with the edition's version", async () => {
  const relativePath = "launcher-packages/editions/s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha/123-lostalphadc14007.zip";
  await Edition.collection.insertOne({
    gameSlug: "s-t-a-l-k-e-r-shadow-of-chernobyl", slug: "lost-alpha", version: full.version,
    installConfig: { playbound_installer: { url: "https://mirror.playbound.club/" + relativePath, fileName: full.filename } },
  });
  host.status.mockResolvedValue({ status: "verified", sizeBytes: full.sizeBytes });
  await syncUploadedPackageArtifacts();
  expect(await Artifact.findOne({ relativePath })).toMatchObject({
    artifactType: "edition", gameSlug: "s-t-a-l-k-e-r-shadow-of-chernobyl", version: full.version,
  });
});
