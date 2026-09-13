import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  createSession,
  getSessionByCode,
  getSessionById,
  joinSession,
  postSignalingMessage,
  pollSignalingMessages,
  updateSessionHeartbeat,
  endSession,
} from "./sessionManager";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "holocure-session-test" });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("HoloCure Multiplayer Session Manager", () => {
  it("creates a session with a valid 6-character room code", async () => {
    const res = await createSession({
      gameVersion: "0.7.1746645739",
      modVersion: "1.5.0-playbound",
      maxPlayers: 4,
    });

    expect(res.session).toBeDefined();
    expect(res.session.sessionId).toHaveLength(36);
    expect(res.session.joinCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(res.session.hostToken).toBeDefined();
    expect(res.session.gameVersion).toBe("0.7.1746645739");
    expect(res.stunServers.length).toBeGreaterThan(0);
  });

  it("resolves session by case-insensitive join code", async () => {
    const { session } = await createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    const foundUpper = await getSessionByCode(session.joinCode.toUpperCase());
    const foundLower = await getSessionByCode(session.joinCode.toLowerCase());

    expect(foundUpper).toBeDefined();
    expect(foundUpper?.sessionId).toBe(session.sessionId);
    expect(foundLower?.sessionId).toBe(session.sessionId);
  });

  it("exchanges signaling messages between host and client", async () => {
    const { session } = await createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });
    const joined = await joinSession(session.joinCode);
    expect(joined?.clientToken).toBeTruthy();

    const clientOffer = await postSignalingMessage(session.sessionId, joined!.clientToken, {
      senderRole: "client",
      recipientRole: "host",
      senderPeerId: "peer-client-123",
      payload: "GNS_OFFER_BLOB_BASE64",
    });
    expect(clientOffer).toBeDefined();

    const hostInbox = await pollSignalingMessages(session.sessionId, session.hostToken, "host", 0);
    expect(hostInbox).toHaveLength(1);
    expect(hostInbox?.[0].payload).toBe("GNS_OFFER_BLOB_BASE64");

    const clientInbox = await pollSignalingMessages(
      session.sessionId,
      joined!.clientToken,
      "client",
      0
    );
    expect(clientInbox).toHaveLength(0);

    await postSignalingMessage(session.sessionId, session.hostToken, {
      senderRole: "host",
      recipientRole: "client",
      senderPeerId: "peer-host-0",
      payload: "GNS_ANSWER_BLOB_BASE64",
    });

    const clientInboxAfterAnswer = await pollSignalingMessages(
      session.sessionId,
      joined!.clientToken,
      "client",
      0
    );
    expect(clientInboxAfterAnswer).toHaveLength(1);
    expect(clientInboxAfterAnswer?.[0].payload).toBe("GNS_ANSWER_BLOB_BASE64");
  });

  it("updates session heartbeat and player count", async () => {
    const { session } = await createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    const updated = await updateSessionHeartbeat(session.sessionId, session.hostToken, 3, "in_game");
    expect(updated).toBe(true);

    const fetched = await getSessionById(session.sessionId);
    expect(fetched?.playerCount).toBe(3);
    expect(fetched?.status).toBe("in_game");
  });

  it("ends session and protects against unauthorized deletion", async () => {
    const { session } = await createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    const badEnd = await endSession(session.sessionId, "invalid-token");
    expect(badEnd).toBe(false);
    expect(await getSessionById(session.sessionId)).not.toBeNull();

    const goodEnd = await endSession(session.sessionId, session.hostToken);
    expect(goodEnd).toBe(true);
    expect(await getSessionById(session.sessionId)).toBeNull();
    expect(await getSessionByCode(session.joinCode)).toBeNull();
  });
});
