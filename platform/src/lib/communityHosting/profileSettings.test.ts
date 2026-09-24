import { describe, expect, it } from "vitest";
import { profileSettingsSchema, validateProfileReadiness } from "./profileSettings";

const candidate = profileSettingsSchema.parse({
  verification: "verified", blockedReason: null, queryKind: "openra-master", queryVerified: true,
  joinVerified: true, enabled: true, rotationEligible: true, weight: 1,
  minimumOnlineMinutes: null, idleMinutes: null, cooldownMinutes: null,
});

describe("profile readiness", () => {
  it("blocks rotation on an idle-only baseline", () => {
    expect(validateProfileReadiness(candidate, { sampleCount: 1, cpuCores: 1, ramBytes: 100, measuredThroughPlayers: 0 }))
      .toContain("idle and occupied");
  });
  it("requires both query and real Join verification", () => {
    expect(validateProfileReadiness({ ...candidate, joinVerified: false }, { sampleCount: 3, cpuCores: 1, ramBytes: 100, measuredThroughPlayers: 2 }))
      .toContain("client Join");
  });
  it("accepts a measured and fully verified profile", () => {
    expect(validateProfileReadiness(candidate, { sampleCount: 3, cpuCores: 1, ramBytes: 100, measuredThroughPlayers: 2 })).toBeNull();
  });
});
