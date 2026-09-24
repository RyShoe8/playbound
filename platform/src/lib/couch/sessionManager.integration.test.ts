import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  createCouchSession,
  getCouchSession,
  joinCouchSession,
  setCouchStoreMode,
  updateCouchController,
} from "./sessionManager";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "couch-multipad-test" });
  setCouchStoreMode("mongo");
}, 120_000);

afterAll(async () => {
  setCouchStoreMode("memory");
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("couch multi-controller slot ownership in Mongo", () => {
  it("assigns concurrent phone pads distinct slots and lets the stream viewer claim a remaining slot", async () => {
    const session = await createCouchSession({ maxPlayers: 4 });
    const viewer = await joinCouchSession(session, { spectator: true });
    expect("controller" in viewer).toBe(true);
    if (!("controller" in viewer)) return;

    const snapshots = await Promise.all([0, 1, 2].map(() => getCouchSession(session.sessionId)));
    const results = await Promise.all(snapshots.map((snap, index) =>
      joinCouchSession(snap!, { label: `Pad ${index}` })));
    expect(results.every((result) => "controller" in result)).toBe(true);
    const slots = results.map((result) => "controller" in result ? result.controller.playerSlot : null);
    expect([...slots].sort()).toEqual([0, 1, 2]);

    const current = await getCouchSession(session.sessionId);
    const claim = await updateCouchController(current!, {
      controllerId: viewer.controller.controllerId,
      controllerToken: viewer.controller.controllerToken,
      spectator: false,
    });
    expect("controller" in claim && claim.controller.playerSlot).toBe(3);
    const stored = await getCouchSession(session.sessionId);
    expect(stored?.controllers.filter((c) => c.status === "approved").map((c) => c.playerSlot).sort()).toEqual([0, 1, 2, 3]);
  });
});
