import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Reporting a failure must not create load.
 *
 * trackPartyFailure writes a TelemetryEvent — a database write. Adding it to
 * every party failure path meant a struggling database produced a write per
 * failure describing the fact that it was struggling, and the party panel polls
 * every 1.5 seconds, so it compounded. That is a feedback loop, not telemetry.
 */

const saved: string[] = [];
vi.mock("@/lib/telemetry/server/saveEvent", () => ({
  saveEvent: async (e: { event: string }) => {
    saved.push(e.event);
  },
}));

let trackPartyFailure: typeof import("./partyTelemetry").trackPartyFailure;

beforeEach(async () => {
  saved.length = 0;
  vi.resetModules();
  ({ trackPartyFailure } = await import("./partyTelemetry"));
});

afterEach(() => vi.restoreAllMocks());

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("database failures", () => {
  it("are never written back to the database", async () => {
    trackPartyFailure("sync", {
      op: "config-sync",
      message: new Error("MongoNetworkError: tlsv1 alert internal error"),
    });
    await flush();
    expect(saved).toEqual([]);
  });

  it("covers the shapes seen in production", async () => {
    for (const m of [
      "MongooseServerSelectionError: ReplicaSetNoPrimary",
      "read ECONNRESET",
      "Catalog read failed: something",
    ]) {
      trackPartyFailure("sync", { op: "config-sync", message: new Error(m) });
    }
    await flush();
    expect(saved).toEqual([]);
  });
});

describe("real failures", () => {
  it("are still recorded", async () => {
    // A Discord outage is worth knowing about and costs one write.
    trackPartyFailure("discord", { op: "provision", status: 500 });
    await flush();
    expect(saved).toEqual(["party_failed"]);
  });

  it("collapse when a polling client repeats them", async () => {
    for (let i = 0; i < 25; i += 1) {
      trackPartyFailure("discord", { op: "provision", gameSlug: "holocure", status: 500 });
    }
    await flush();
    expect(saved).toHaveLength(1);
  });

  it("still separate distinct problems", async () => {
    trackPartyFailure("discord", { op: "provision", gameSlug: "holocure" });
    trackPartyFailure("discord", { op: "cleanup", gameSlug: "holocure" });
    trackPartyFailure("lan", { op: "provision", gameSlug: "holocure" });
    await flush();
    expect(saved).toHaveLength(3);
  });
});
