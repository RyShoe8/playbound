import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  getSessionByCode,
  getSessionById,
  postSignalingMessage,
  pollSignalingMessages,
  updateSessionHeartbeat,
  endSession,
  purgeStaleSessions,
} from "./sessionManager";

describe("HoloCure Multiplayer Session Manager", () => {
  it("creates a session with a valid 6-character room code", () => {
    const res = createSession({
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

  it("resolves session by case-insensitive join code", () => {
    const { session } = createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    const foundUpper = getSessionByCode(session.joinCode.toUpperCase());
    const foundLower = getSessionByCode(session.joinCode.toLowerCase());

    expect(foundUpper).toBeDefined();
    expect(foundUpper?.sessionId).toBe(session.sessionId);
    expect(foundLower?.sessionId).toBe(session.sessionId);
  });

  it("exchanges signaling messages between host and client", () => {
    const { session } = createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    // Client posts offer/rendezvous payload to host
    const clientOffer = postSignalingMessage(session.sessionId, {
      senderRole: "client",
      recipientRole: "host",
      senderPeerId: "peer-client-123",
      payload: "GNS_OFFER_BLOB_BASE64",
    });
    expect(clientOffer).toBeDefined();

    // Host polls for incoming client messages
    const hostInbox = pollSignalingMessages(session.sessionId, "host", 0);
    expect(hostInbox).toHaveLength(1);
    expect(hostInbox[0].payload).toBe("GNS_OFFER_BLOB_BASE64");

    // Client polling for client messages gets nothing
    const clientInbox = pollSignalingMessages(session.sessionId, "client", 0);
    expect(clientInbox).toHaveLength(0);

    // Host posts answer payload to client
    postSignalingMessage(session.sessionId, {
      senderRole: "host",
      recipientRole: "client",
      senderPeerId: "peer-host-0",
      payload: "GNS_ANSWER_BLOB_BASE64",
    });

    const clientInboxAfterAnswer = pollSignalingMessages(
      session.sessionId,
      "client",
      0
    );
    expect(clientInboxAfterAnswer).toHaveLength(1);
    expect(clientInboxAfterAnswer[0].payload).toBe("GNS_ANSWER_BLOB_BASE64");
  });

  it("updates session heartbeat and player count", () => {
    const { session } = createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    const updated = updateSessionHeartbeat(session.sessionId, 3, "in_game");
    expect(updated).toBe(true);

    const fetched = getSessionById(session.sessionId);
    expect(fetched?.playerCount).toBe(3);
    expect(fetched?.status).toBe("in_game");
  });

  it("ends session and protects against unauthorized deletion", () => {
    const { session } = createSession({
      gameVersion: "0.7.x",
      modVersion: "1.5.0",
    });

    // Wrong token fails
    const badEnd = endSession(session.sessionId, "invalid-token");
    expect(badEnd).toBe(false);
    expect(getSessionById(session.sessionId)).not.toBeNull();

    // Correct token succeeds
    const goodEnd = endSession(session.sessionId, session.hostToken);
    expect(goodEnd).toBe(true);
    expect(getSessionById(session.sessionId)).toBeNull();
    expect(getSessionByCode(session.joinCode)).toBeNull();
  });
});
