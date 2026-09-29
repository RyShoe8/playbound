import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));
import DedicatedSupportTicket from "@/lib/models/DedicatedSupportTicket";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CommunityServer from "@/lib/models/CommunityServer";
import RateLimitBucket from "@/lib/models/RateLimitBucket";
import { createSupportTicket, replyToSupportTicket } from "./support";

let mongo: MongoMemoryServer;
const owner = new Types.ObjectId().toString();
const stranger = new Types.ObjectId().toString();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "dedicated-support-test" });
  await RateLimitBucket.init();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([DedicatedSupportTicket.deleteMany({}), DedicatedSubscription.deleteMany({}), CommunityServer.deleteMany({}), RateLimitBucket.deleteMany({})]);
  await DedicatedSubscription.create({ userId: owner, tier: "basic", regionKey: "us-central", slotCapacity: 8 });
});

describe("Dedicated support", () => {
  it("requires an owned server and never exposes a request to another customer", async () => {
    const server = await CommunityServer.create({ slug: "support-test", name: "Server", gameSlug: "openra", regionKey: "us-central", profileKey: "openra:base", ownerType: "user", ownerId: owner });
    const invalid = await createSupportTicket(owner, { category: "server", subject: "Help", body: "The server is down", serverId: new Types.ObjectId().toString() });
    expect(invalid).toMatchObject({ status: 404 });
    const created = await createSupportTicket(owner, { category: "server", subject: "Help", body: "The server is down", serverId: String(server._id) });
    expect(created).toMatchObject({ status: 201 });
    if (!("ticket" in created) || !created.ticket) throw new Error("Ticket missing");
    const id = created.ticket.id;
    expect(await replyToSupportTicket(id, stranger, "customer", "I can see this?")).toMatchObject({ status: 404 });
    expect((await DedicatedSupportTicket.findById(id))?.messages).toHaveLength(1);
    expect(await replyToSupportTicket(id, owner, "customer", "I tried restarting it")).toMatchObject({ status: 200 });
    expect((await DedicatedSupportTicket.findById(id))?.messages).toHaveLength(2);
  });

  it("rejects non-customers and caps open requests", async () => {
    expect(await createSupportTicket(stranger, { category: "billing", subject: "Question", body: "Need help" })).toMatchObject({ status: 403 });
    for (let n = 0; n < 3; n++) expect(await createSupportTicket(owner, { category: "billing", subject: `Question ${n}`, body: "Need help" })).toMatchObject({ status: 201 });
    expect(await createSupportTicket(owner, { category: "billing", subject: "More", body: "Need help" })).toMatchObject({ status: 429 });
  });
});
