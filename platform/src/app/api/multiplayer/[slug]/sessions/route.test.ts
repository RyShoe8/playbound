import { afterAll, beforeAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { POST as createGenericSession } from "./route";
import { POST as joinGenericSession } from "./[id]/join/route";
import { POST as postGenericSignal, GET as getGenericSignal } from "./[id]/signal/route";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "generic-multiplayer-test" });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Generic Multiplayer API Endpoints", () => {
  it("creates and joins a multi-game room for KeeperFX and Wesnoth", async () => {
    // 1. Create KeeperFX session
    const reqKeeper = new Request("http://localhost/api/multiplayer/keeperfx/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameVersion: "0.5.0",
        maxPlayers: 4,
      }),
    });

    const resKeeper = await createGenericSession(reqKeeper, {
      params: Promise.resolve({ slug: "keeperfx" }),
    });
    expect(resKeeper.status).toBe(201);
    const dataKeeper = await resKeeper.json();
    expect(dataKeeper.gameSlug).toBe("keeperfx");
    expect(dataKeeper.joinCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

    // 2. Join KeeperFX session
    const joinReq = new Request(
      `http://localhost/api/multiplayer/keeperfx/sessions/${dataKeeper.joinCode}/join`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gameVersion: "0.5.0" }),
      }
    );

    const joinRes = await joinGenericSession(joinReq, {
      params: Promise.resolve({ slug: "keeperfx", id: dataKeeper.joinCode }),
    });
    expect(joinRes.status).toBe(200);
    const joinData = await joinRes.json();
    expect(joinData.sessionId).toBe(dataKeeper.sessionId);
    expect(joinData.gameSlug).toBe("keeperfx");

    // 3. Post signal
    const signalReq = new Request(
      `http://localhost/api/multiplayer/keeperfx/sessions/${dataKeeper.sessionId}/signal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${joinData.clientToken}`,
        },
        body: JSON.stringify({
          senderRole: "client",
          recipientRole: "host",
          senderPeerId: "peer-keeper-1",
          payload: "KEEPERFX_ENET_SDP",
        }),
      }
    );
    const sigRes = await postGenericSignal(signalReq, {
      params: Promise.resolve({ slug: "keeperfx", id: dataKeeper.sessionId }),
    });
    expect(sigRes.status).toBe(201);

    // 4. Poll signal
    const pollReq = new Request(
      `http://localhost/api/multiplayer/keeperfx/sessions/${dataKeeper.sessionId}/signal?forRole=host&since=0`,
      { headers: { Authorization: `Bearer ${dataKeeper.hostToken}` } }
    );
    const pollRes = await getGenericSignal(pollReq, {
      params: Promise.resolve({ slug: "keeperfx", id: dataKeeper.sessionId }),
    });
    expect(pollRes.status).toBe(200);
    const pollData = await pollRes.json();
    expect(pollData.messages.length).toBe(1);
    expect(pollData.messages[0].payload).toBe("KEEPERFX_ENET_SDP");
  });
});
