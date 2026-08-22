import { beforeEach, describe, expect, it } from "vitest";
import { BUTTON, parseInputPacketV1, emptyPadState } from "@/lib/couch/protocol";
import {
  setCouchStoreMode,
  createCouchSession,
  joinCouchSession,
  approveController,
  getCouchSessionByCode,
  rejectOrKickController,
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
});
