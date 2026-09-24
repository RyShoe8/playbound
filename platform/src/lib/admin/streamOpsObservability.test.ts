import { describe, expect, it, vi } from "vitest";

const bugs: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/BugReport", () => ({
  default: {
    findOne: async () => null,
    create: async (doc: Record<string, unknown>) => { bugs.push(doc); },
  },
}));

describe("stream failures reach both Ops and Bugs", () => {
  it.each(["remote_play_failed", "couch_failed"])("files %s with stage and session context", async (event) => {
    bugs.length = 0;
    const { maybeUpsertAutoBugFromTelemetry } = await import("@/lib/autoBugReport");
    await maybeUpsertAutoBugFromTelemetry({
      event,
      properties: {
        source: "launcher", code: "FIRST_FRAME_TIMEOUT", phase: "video",
        message: "Connected, no first frame", couchSessionId: "session-123",
        transport: "webrtc", connectionState: "connected", iceState: "completed",
      },
    });
    expect(bugs).toHaveLength(1);
    expect(String(bugs[0].description)).toContain("Couch session: session-123");
    expect(String(bugs[0].description)).toContain("Phase: video");
  });

  it("keeps a stream network failure in Bugs", async () => {
    bugs.length = 0;
    const { maybeUpsertAutoBugFromTelemetry } = await import("@/lib/autoBugReport");
    await maybeUpsertAutoBugFromTelemetry({
      event: "remote_play_failed",
      properties: { source: "launcher", phase: "request", code: "REQUEST_EXCEPTION", message: "EAI_AGAIN" },
    });
    expect(bugs).toHaveLength(1);
  });
});
