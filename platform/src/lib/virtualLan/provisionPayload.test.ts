import { describe, expect, it } from "vitest";
import { lanPayloadFromDoc } from "./provision";

describe("party LAN host readiness", () => {
  it("requires a live host listener for direct-IP RetroArch netplay", () => {
    const lan = lanPayloadFromDoc("baseball-stars-2", "self", { status: "ready" });
    expect(lan.enabled).toBe(true);
    expect(lan.requiresHostReady).toBe(true);
  });

  it("does not probe a discovery-only virtual LAN game", () => {
    const lan = lanPayloadFromDoc("holocure", "self", { status: "ready" });
    expect(lan.enabled).toBe(true);
    expect(lan.requiresHostReady).toBe(false);
  });
});
