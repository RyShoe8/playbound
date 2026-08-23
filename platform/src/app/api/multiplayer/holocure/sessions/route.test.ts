import { describe, it, expect } from "vitest";
import { POST as createSessionRoute } from "./route";
import { POST as joinSessionRoute } from "./[id]/join/route";
import {
  POST as postSignalRoute,
  GET as getSignalRoute,
} from "./[id]/signal/route";
import {
  POST as heartbeatRoute,
  DELETE as deleteSessionRoute,
} from "./[id]/heartbeat/route";

describe("HoloCure Multiplayer API Endpoints", () => {
  it("executes full session lifecycle (create -> join -> signal -> heartbeat -> delete)", async () => {
    // 1. Create Session
    const createReq = new Request(
      "http://localhost/api/multiplayer/holocure/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameVersion: "0.7.1746645739",
          modVersion: "1.5.0-playbound",
          maxPlayers: 4,
        }),
      }
    );

    const createRes = await createSessionRoute(createReq);
    expect(createRes.status).toBe(201);
    const sessionData = await createRes.json();
    expect(sessionData.sessionId).toBeDefined();
    expect(sessionData.joinCode).toHaveLength(6);
    expect(sessionData.hostToken).toBeDefined();
    expect(sessionData.stunServers.length).toBeGreaterThan(0);

    const sessionId = sessionData.sessionId;
    const joinCode = sessionData.joinCode;
    const hostToken = sessionData.hostToken;

    // 2. Client joins via room code
    const joinReq = new Request(
      `http://localhost/api/multiplayer/holocure/sessions/${joinCode}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameVersion: "0.7.1746645739",
          modVersion: "1.5.0-playbound",
        }),
      }
    );

    const joinRes = await joinSessionRoute(joinReq, {
      params: Promise.resolve({ id: joinCode }),
    });
    expect(joinRes.status).toBe(200);
    const joinData = await joinRes.json();
    expect(joinData.sessionId).toBe(sessionId);
    expect(joinData.versionMismatch).toBe(false);

    // 3. Client posts signaling offer to Host
    const postSignalReq = new Request(
      `http://localhost/api/multiplayer/holocure/sessions/${sessionId}/signal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderRole: "client",
          recipientRole: "host",
          senderPeerId: "client-peer-1",
          payload: "GNS_OFFER_SAMPLE_BASE64",
        }),
      }
    );
    const signalRes = await postSignalRoute(postSignalReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(signalRes.status).toBe(201);

    // 4. Host polls for signaling messages
    const getSignalReq = new Request(
      `http://localhost/api/multiplayer/holocure/sessions/${sessionId}/signal?forRole=host&since=0`
    );
    const pollRes = await getSignalRoute(getSignalReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(pollRes.status).toBe(200);
    const pollData = await pollRes.json();
    expect(pollData.messages.length).toBe(1);
    expect(pollData.messages[0].payload).toBe("GNS_OFFER_SAMPLE_BASE64");

    // 5. Host sends heartbeat
    const hbReq = new Request(
      `http://localhost/api/multiplayer/holocure/sessions/${sessionId}/heartbeat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerCount: 2,
          status: "in_game",
        }),
      }
    );
    const hbRes = await heartbeatRoute(hbReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(hbRes.status).toBe(200);

    // 6. Host ends session
    const delReq = new Request(
      `http://localhost/api/multiplayer/holocure/sessions/${sessionId}/heartbeat`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${hostToken}` },
      }
    );
    const delRes = await deleteSessionRoute(delReq, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(delRes.status).toBe(200);
  });
});
