import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PARTY_OPS_EVENTS } from "@/lib/admin/opsEvents";
import { FAILURE_RATE_EVENTS } from "@/lib/admin/failureRateShared";

/**
 * Where a party failure ends up.
 *
 * Three surfaces read the same telemetry rows and none of them agree on what
 * they want: the Ops event feed lists notable events by name, the failure-rate
 * card counts party_ok against party_failed and buckets by platform, and the
 * auto-bug pipeline opens a Bug for a subset. A failure can therefore be
 * perfectly recorded and still be invisible on the surface someone is actually
 * looking at, which is not something you notice until you go looking for a
 * failure you know happened.
 *
 * These assert the routing rather than the plumbing: given a party failure of
 * each kind, which of the three see it.
 */

type SavedEvent = { event: string; properties?: Record<string, unknown> };
const saved: SavedEvent[] = [];

vi.mock("@/lib/telemetry/server/saveEvent", () => ({
  saveEvent: async (e: SavedEvent) => {
    saved.push(e);
  },
}));

const bugsCreated: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/BugReport", () => ({
  default: {
    findOne: async () => null,
    create: async (doc: Record<string, unknown>) => {
      bugsCreated.push(doc);
    },
  },
}));

let partyTelemetry: typeof import("./partyTelemetry");
let maybeUpsertAutoBugFromTelemetry: typeof import("@/lib/autoBugReport").maybeUpsertAutoBugFromTelemetry;

beforeEach(async () => {
  saved.length = 0;
  bugsCreated.length = 0;
  vi.resetModules();
  partyTelemetry = await import("./partyTelemetry");
  ({ maybeUpsertAutoBugFromTelemetry } = await import("@/lib/autoBugReport"));
});

afterEach(() => vi.restoreAllMocks());

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Run a saved event through the bug pipeline the way saveEvent does. */
async function routeToBugs(e: SavedEvent) {
  await maybeUpsertAutoBugFromTelemetry({
    event: e.event,
    properties: e.properties,
    userId: null,
    userAgent: null,
  });
}

describe("party failures reaching Ops", () => {
  it("emit an event the Ops feed lists", async () => {
    partyTelemetry.trackPartyFailure("discord", { op: "provision", status: 500 });
    await flush();
    expect(saved).toHaveLength(1);
    expect(PARTY_OPS_EVENTS as readonly string[]).toContain(saved[0].event);
  });

  it("emit the event the failure-rate card counts", async () => {
    partyTelemetry.trackPartyFailure("sync", { op: "config-sync", status: 500 });
    partyTelemetry.trackPartyOk("sync", { op: "config-sync" });
    await flush();
    const names = saved.map((e) => e.event);
    expect(names).toContain(FAILURE_RATE_EVENTS.partyFailed);
    expect(names).toContain(FAILURE_RATE_EVENTS.partyCompleted);
  });

  it("carry the server origin so the card does not call them Unknown", async () => {
    partyTelemetry.trackPartyFailure("discord", { op: "provision", status: 500 });
    await flush();
    expect(saved[0].properties?.origin).toBe("server");
  });

  it("carry the leader's platform when the party recorded one", async () => {
    partyTelemetry.trackPartyFailure("host", {
      op: "provision",
      ...partyTelemetry.partyEventProps({
        _id: "abc",
        gameSlug: "holocure",
        leaderOs: "macos",
      }),
    });
    await flush();
    expect(saved[0].properties?.platform).toBe("macos");
    expect(saved[0].properties?.partyId).toBe("abc");
  });

  it("omit platform rather than inventing one for an older party", async () => {
    partyTelemetry.trackPartyFailure("host", {
      op: "provision",
      ...partyTelemetry.partyEventProps({ _id: "abc", gameSlug: "holocure" }),
    });
    await flush();
    // Absent, not "unknown" — the card decides what to call it, and for a
    // server-raised event with no platform that is Server.
    expect(saved[0].properties?.platform).toBeUndefined();
    expect(saved[0].properties?.origin).toBe("server");
  });
});

describe("party failures reaching Bugs", () => {
  it("opens a bug for a LAN failure", async () => {
    partyTelemetry.trackPartyFailure("lan", {
      op: "provision",
      gameSlug: "holocure",
      message: "NetBird 502",
    });
    await flush();
    await routeToBugs(saved[0]);
    expect(bugsCreated).toHaveLength(1);
    expect(String(bugsCreated[0].title)).toContain("party_failed");
  });

  it("does NOT open a bug for discord, sync, launch or membership", async () => {
    // Deliberate: party_failed fires for every area, and auto-bugging all of
    // them would bury the Bugs page. Those areas are covered by the Ops feed
    // and the failure-rate card instead. Locked here so the asymmetry is a
    // decision rather than a surprise when a failure never becomes a bug.
    for (const area of ["discord", "sync", "launch", "membership"] as const) {
      saved.length = 0;
      partyTelemetry.trackPartyFailure(area, { op: `op-${area}`, status: 500 });
      await flush();
      expect(saved, `${area} should still reach Ops`).toHaveLength(1);
      await routeToBugs(saved[0]);
    }
    expect(bugsCreated).toHaveLength(0);
  });

  it("opens bugs for the host, LAN and chat events raised alongside", async () => {
    // These are separate event names, emitted directly rather than through
    // trackPartyFailure, and they are the reason a host failure still becomes
    // a bug even though party_failed(area: host) does not.
    for (const event of ["party_hosted_failed", "party_lan_failed", "party_chat_failed"]) {
      await routeToBugs({
        event,
        properties: { gameSlug: "holocure", message: "boom", op: "provision" },
      });
    }
    expect(bugsCreated).toHaveLength(3);
  });

  it("puts the leader's platform on the bug", async () => {
    // Previously null for every party bug, because party events carried no
    // platform at all.
    await routeToBugs({
      event: "party_hosted_failed",
      properties: { gameSlug: "holocure", message: "boom", platform: "linux" },
    });
    expect(bugsCreated[0].platform).toBe("linux");
  });
});

describe("what is deliberately dropped", () => {
  it("never reports a database failure back to the database", async () => {
    partyTelemetry.trackPartyFailure("sync", {
      op: "config-sync",
      message: new Error("MongoNetworkError: tlsv1 alert internal error"),
    });
    await flush();
    expect(saved).toEqual([]);
  });

  it("collapses a repeated failure for a minute", async () => {
    // Worth knowing while testing: hitting the same broken thing twenty times
    // in a minute produces one Ops row, not twenty.
    for (let i = 0; i < 20; i++) {
      partyTelemetry.trackPartyFailure("discord", {
        op: "provision",
        gameSlug: "holocure",
        status: 500,
      });
    }
    await flush();
    expect(saved).toHaveLength(1);
  });

  it("keeps distinct problems distinct", async () => {
    partyTelemetry.trackPartyFailure("discord", { op: "provision", gameSlug: "a" });
    partyTelemetry.trackPartyFailure("discord", { op: "provision", gameSlug: "b" });
    partyTelemetry.trackPartyFailure("lan", { op: "provision", gameSlug: "a" });
    await flush();
    expect(saved).toHaveLength(3);
  });
});
