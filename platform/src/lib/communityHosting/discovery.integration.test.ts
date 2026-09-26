/**
 * What public discovery (Multiplayer) lists. PlayBound Dedicated servers are
 * listed only when public; unlisted and private ones must never appear —
 * including through the merge of live agent rooms the database query missed,
 * which once re-added exactly the servers the query had hidden.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let communityEnabled = true;
const rooms: Array<{ roomId: string; communityServerId?: string; gameSlug: string; host: string; port: number; name: string }> = [];
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/models/CommunityHostingConfig", () => ({
  default: { findOne: () => ({ select: () => ({ lean: async () => ({ enabled: communityEnabled, node: { regionLabel: "US Central" } }) }) }) },
}));
vi.mock("@/lib/gameHost/client", () => ({ listManagedHostRooms: async () => ({ ok: true, rooms, jobs: {} }) }));
vi.mock("@/lib/catalog", () => ({ listGames: async () => [{ slug: "xonotic", title: "Xonotic" }] }));

import CommunityServer from "@/lib/models/CommunityServer";
import { listAllJoinableCommunityServers, listJoinableCommunityServers } from "./discovery";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "discovery-test" });
  // discovery checks for a configured database before reading; point it at this one.
  process.env.MONGODB_URI = mongo.getUri();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function server(slug: string, extra: Record<string, unknown>) {
  const doc = await CommunityServer.create({
    slug, name: slug, gameSlug: "xonotic", regionKey: "us-central", profileKey: "xonotic:base",
    desiredState: "running", runtimeState: "running", host: "1.2.3.4", port: 26000 + rooms.length, ...extra,
  });
  rooms.push({ roomId: `room-${slug}`, communityServerId: String(doc._id), gameSlug: "xonotic", host: "1.2.3.4", port: doc.port as number, name: slug });
  return doc;
}

beforeEach(async () => {
  rooms.length = 0;
  communityEnabled = true;
  await CommunityServer.deleteMany({});
  const owner = new Types.ObjectId();
  await server("auto", {});
  await server("public-one", { ownerType: "user", ownerId: owner, visibility: "public", currentMap: "stormkeep" });
  await server("unlisted-one", { ownerType: "user", ownerId: owner, visibility: "unlisted" });
  await server("private-one", { ownerType: "user", ownerId: owner, visibility: "private" });
});

const names = (list: Array<{ name: string }>) => list.map((s) => s.name).sort();

describe("discovery visibility", () => {
  it("lists public customer servers with their page and map, never unlisted or private ones", async () => {
    for (const list of [await listJoinableCommunityServers("xonotic"), await listAllJoinableCommunityServers()]) {
      expect(names(list)).toEqual(["auto", "public-one"]);
      const pub = list.find((s) => s.name === "public-one")!;
      expect(pub.pageUrl).toBe("/servers/xonotic/public-one");
      expect(pub.map).toBe("stormkeep");
      expect(list.find((s) => s.name === "auto")!.pageUrl).toBeUndefined();
    }
  });

  it("keeps listing public customer servers when automatic hosting is off", async () => {
    communityEnabled = false;
    expect(names(await listJoinableCommunityServers("xonotic"))).toEqual(["public-one"]);
    expect(names(await listAllJoinableCommunityServers())).toEqual(["public-one"]);
  });
});

describe("public server pages", () => {
  it("exist for public and unlisted customer servers only; unlisted ones are not indexed", async () => {
    const { loadPublicServer } = await import("@/lib/dedicatedHosting/view");
    expect(await loadPublicServer("xonotic", "public-one")).toMatchObject({ name: "public-one", listed: true, currentMap: "stormkeep", running: true });
    expect(await loadPublicServer("xonotic", "unlisted-one")).toMatchObject({ listed: false });
    expect(await loadPublicServer("xonotic", "private-one")).toBeNull();
    expect(await loadPublicServer("xonotic", "auto")).toBeNull();
    expect(await loadPublicServer("openttd", "public-one")).toBeNull();
  });
});
