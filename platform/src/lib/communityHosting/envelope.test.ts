import { describe, expect, it } from "vitest";
import { DEFAULT_COMMUNITY_SERVER_ENVELOPE, getEffectiveEnvelope } from "./reconcile";

const MB = 1024 * 1024;

describe("getEffectiveEnvelope", () => {
  it("uses measured (already padded) envelopes instead of the fallback", () => {
    expect(getEffectiveEnvelope({ cpuCores: 0.25, ramBytes: 53 * MB }, "luanti")).toEqual({ cpuCores: 0.25, ramBytes: 256 * MB });
    expect(getEffectiveEnvelope({ cpuCores: 1.47, ramBytes: 308 * MB }, "xonotic")).toEqual({ cpuCores: 1.47, ramBytes: 308 * MB });
  });

  it("keeps half the heavy baseline as a CPU floor for player-heavy games", () => {
    expect(getEffectiveEnvelope({ cpuCores: 0.25, ramBytes: 1065 * MB }, "counter-strike-2").cpuCores).toBe(1);
  });

  it("falls back only without data or for the exact legacy placeholder", () => {
    expect(getEffectiveEnvelope(null, "mindustry")).toEqual(DEFAULT_COMMUNITY_SERVER_ENVELOPE);
    expect(getEffectiveEnvelope({ cpuCores: 0, ramBytes: 0 }, "mindustry")).toEqual(DEFAULT_COMMUNITY_SERVER_ENVELOPE);
    expect(getEffectiveEnvelope({ cpuCores: 0.25, ramBytes: 512 * MB }, "mindustry")).toEqual(DEFAULT_COMMUNITY_SERVER_ENVELOPE);
  });
});
