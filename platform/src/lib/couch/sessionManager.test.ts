import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUTTON, parseInputPacketV1, emptyPadState } from "@/lib/couch/protocol";
import CouchSessionModel from "@/lib/models/CouchSession";
import {
  setCouchStoreMode,
  createCouchSession,
  joinCouchSession,
  approveController,
  getCouchSession,
  getCouchSessionByCode,
  rejectOrKickController,
  setHostEndpoints,
  publicCouchSnapshot,
  postCouchSignal,
  pollCouchSignals,
  heartbeatHost,
  touchCouchSessionActivity,
} from "@/lib/couch/sessionManager";

describe("couch protocol", () => {
  it("parses v1 packets and clamps axes", () => {
    const p = parseInputPacketV1({
      v: 1,
      seq: 3,
      t: 100,
      p: 1,
      buttons: BUTTON.A | BUTTON.START,
      lx: 2,
      ly: -3,
      rx: 0,
      ry: 0,
      lt: 1.5,
      rt: -1,
    });
    expect(p).not.toBeNull();
    expect(p!.lx).toBe(1);
    expect(p!.ly).toBe(-1);
    expect(p!.lt).toBe(1);
    expect(p!.rt).toBe(0);
    expect(p!.buttons & BUTTON.A).toBeTruthy();
  });

  it("rejects bad slots", () => {
    expect(parseInputPacketV1({ ...emptyPadState(0), p: 9 })).toBeNull();
  });
});

describe("couch sessions", () => {
  beforeEach(() => {
    setCouchStoreMode("memory");
  });

  it("retains distinct ICE messages created in the same millisecond", async () => {
    const session = await createCouchSession({});
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      const first = await postCouchSignal(session, {
        senderRole: "controller", recipientRole: "host", senderPeerId: "guest",
        payload: JSON.stringify({ kind: "ice", candidate: "first" }),
      });
      const second = await postCouchSignal(session, {
        senderRole: "controller", recipientRole: "host", senderPeerId: "guest",
        payload: JSON.stringify({ kind: "ice", candidate: "second" }),
      });
      expect(first?.timestamp).toBe(second?.timestamp);
      expect(first?.id).not.toBe(second?.id);
      expect(pollCouchSignals(session, "host", first!.timestamp - 1).map((m) => m.id))
        .toEqual([first!.id, second!.id]);
    } finally {
      clock.mockRestore();
    }
  });

  it("atomically appends Mongo signals and sets host endpoints without replacing the session message or controller arrays", async () => {
    const session = await createCouchSession({});
    const update = vi.spyOn(CouchSessionModel, "updateOne").mockResolvedValue({ matchedCount: 1 } as never);
    setCouchStoreMode("mongo");
    try {
      const signal = await postCouchSignal(session, {
        senderRole: "controller", recipientRole: "host", senderPeerId: "guest",
        payload: JSON.stringify({ kind: "ice", candidate: "candidate-a" }),
      });
      expect(signal).toBeTruthy();
      expect(update).toHaveBeenCalledWith(
        { sessionId: session.sessionId, status: "open" },
        expect.objectContaining({
          $push: { messages: { $each: [signal], $slice: -1024 } },
        })
      );
      await setHostEndpoints(session, { wsUrls: [], wsToken: "token" });
      expect(update).toHaveBeenCalledWith(
        { sessionId: session.sessionId, status: "open" },
        expect.objectContaining({
          $set: expect.objectContaining({
            hostEndpoints: expect.objectContaining({ wsToken: "token" }),
          }),
        })
      );
    } finally {
      setCouchStoreMode("memory");
      update.mockRestore();
    }
  });

  it("atomically updates host heartbeats and controller activity in Mongo without replacing controllers", async () => {
    const session = await createCouchSession({});
    const update = vi.spyOn(CouchSessionModel, "updateOne").mockResolvedValue({ matchedCount: 1 } as never);
    setCouchStoreMode("mongo");
    try {
      await heartbeatHost(session);
      expect(update).toHaveBeenCalledWith(
        { sessionId: session.sessionId, status: "open" },
        expect.objectContaining({
          $max: expect.objectContaining({ lastHeartbeat: expect.any(Number) }),
        })
      );
      await touchCouchSessionActivity(session, {
        controllerId: "ctrl-1",
        controllerToken: "tok",
        sessionToken: null,
        label: "Pad",
        profile: "phone",
        status: "approved",
        playerSlot: 0,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      });
      expect(update).toHaveBeenCalledWith(
        { sessionId: session.sessionId, status: "open", "controllers.controllerId": "ctrl-1" },
        expect.objectContaining({
          $max: expect.objectContaining({
            lastHeartbeat: expect.any(Number),
            "controllers.$.lastSeen": expect.any(Number),
          }),
        })
      );
    } finally {
      setCouchStoreMode("memory");
      update.mockRestore();
    }
  });

  it("creates joinable sessions and auto-approves", async () => {
    const session = await createCouchSession({ hostLabel: "Test Host" });
    expect(session.joinCode).toHaveLength(6);
    const found = await getCouchSessionByCode(session.joinCode);
    expect(found?.sessionId).toBe(session.sessionId);

    const joined = await joinCouchSession(session, { label: "Phone A" });
    expect("controller" in joined).toBe(true);
    if ("controller" in joined) {
      expect(joined.controller.status).toBe("approved");
      expect(joined.controller.playerSlot).toBe(0);
      expect(joined.controller.sessionToken).toBeTruthy();
    }
  });

  it("reconnects to the same slot", async () => {
    const session = await createCouchSession({});
    const first = await joinCouchSession(session, { label: "Phone" });
    expect("controller" in first).toBe(true);
    if (!("controller" in first)) return;
    const again = await joinCouchSession(session, {
      controllerId: first.controller.controllerId,
      controllerToken: first.controller.controllerToken,
    });
    expect("controller" in again).toBe(true);
    if ("controller" in again) {
      expect(again.reconnect).toBe(true);
      expect(again.controller.playerSlot).toBe(first.controller.playerSlot);
    }
  });

  it("supports manual approve when autoApprove is false", async () => {
    const session = await createCouchSession({ autoApprove: false });
    const joined = await joinCouchSession(session, { label: "Phone" });
    expect("controller" in joined).toBe(true);
    if (!("controller" in joined)) return;
    expect(joined.controller.status).toBe("pending");
    const approved = await approveController(session, joined.controller.controllerId);
    expect("error" in approved).toBe(false);
    if (!("error" in approved)) {
      expect(approved.status).toBe("approved");
      expect(approved.playerSlot).toBe(0);
    }
    expect(await rejectOrKickController(session, joined.controller.controllerId)).toBe(true);
  });

  it("drops stale open sessions on load", async () => {
    const session = await createCouchSession({});
    expect(await getCouchSession(session.sessionId)).toBeTruthy();
    session.lastHeartbeat = Date.now() - 6 * 60 * 1000;
    expect(await getCouchSession(session.sessionId)).toBeNull();
    expect(await getCouchSessionByCode(session.joinCode)).toBeNull();
  });

  it("reserves slot 0 for the host pad and assigns remotes from 1", async () => {
    const session = await createCouchSession({ reserveHostSlot: true });
    expect(session.reserveHostSlot).toBe(true);
    const joined = await joinCouchSession(session, { label: "Remote" });
    expect("controller" in joined).toBe(true);
    if ("controller" in joined) {
      expect(joined.controller.playerSlot).toBe(1);
    }
  });

  it("ignores host-published iceServers and serves platform ICE on snapshot", async () => {
    const prevIp = process.env.GAME_HOST_PUBLIC_IP;
    const prevSecret = process.env.TURN_SHARED_SECRET;
    process.env.GAME_HOST_PUBLIC_IP = "203.0.113.10";
    process.env.TURN_SHARED_SECRET = "test-secret";
    try {
      const session = await createCouchSession({});
      await setHostEndpoints(session, {
        wsUrls: ["ws://192.168.1.2:9"],
        wsToken: "tok",
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      const snap = publicCouchSnapshot(session);
      expect(snap.hostEndpoints?.wsUrls).toEqual(["ws://192.168.1.2:9"]);
      const urls = (snap.hostEndpoints?.iceServers || []).map((s) => s.urls);
      expect(urls).toContain("stun:stun.cloudflare.com:3478");
      expect(urls).toContain("turn:203.0.113.10:3478");
    } finally {
      if (prevIp === undefined) delete process.env.GAME_HOST_PUBLIC_IP;
      else process.env.GAME_HOST_PUBLIC_IP = prevIp;
      if (prevSecret === undefined) delete process.env.TURN_SHARED_SECRET;
      else process.env.TURN_SHARED_SECRET = prevSecret;
    }
  });
});
