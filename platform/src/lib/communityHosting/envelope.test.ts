import { describe, expect, it } from "vitest";
import { communityRuntimeReservation, DEFAULT_COMMUNITY_SERVER_ENVELOPE, getEffectiveEnvelope, isAutomaticHostingCandidate } from "./reconcile";

const MB = 1024 * 1024;

describe("getEffectiveEnvelope", () => {
  it("releases ANEURISM startup headroom only for a settled, confirmed-empty runtime", () => {
    const now = new Date('2026-10-13T21:00:00Z');
    const profile = {sampleCount:3,envelope:{cpuCores:1.85,ramBytes:1200*MB}};
    const room = {gameSlug:'aneurism-iv',processStartedAt:now.getTime()-600000,
      resources:{available:true,cpuCores:1.2,rssBytes:900*MB}};
    expect(communityRuntimeReservation(profile,room,0,now).cpuCores).toBe(1.85);
    expect(communityRuntimeReservation(profile,room,1,now).cpuCores).toBe(3);
    expect(communityRuntimeReservation(profile,room,null,now).cpuCores).toBe(3);
    expect(communityRuntimeReservation(profile,{...room,processStartedAt:now.getTime()-1000},0,now).cpuCores).toBe(3);
    expect(communityRuntimeReservation({...profile,sampleCount:1},room,0,now).cpuCores).toBe(2.4);
  });
  it("reserves startup headroom for ANEURISM even with a smaller idle reading", () => {
    expect(getEffectiveEnvelope({ cpuCores: 1, ramBytes: 1536 * MB }, "aneurism-iv")).toEqual({cpuCores: 3, ramBytes: 2048 * MB});
    expect(getEffectiveEnvelope({ cpuCores: 4, ramBytes: 4096 * MB }, "aneurism-iv")).toEqual({cpuCores: 4, ramBytes: 4096 * MB});
  });
  it("permits only enabled ANEURISM base enrollment with its registered live query", () => {
    const profile = {key:"aneurism-iv:base",gameSlug:"aneurism-iv",enabled:true,queryKind:"none",queryVerified:false};
    expect(isAutomaticHostingCandidate(profile)).toBe(true);
    expect(isAutomaticHostingCandidate({...profile,enabled:false})).toBe(false);
    expect(isAutomaticHostingCandidate({...profile,key:"aneurism-iv:other"})).toBe(false);
    expect(isAutomaticHostingCandidate({...profile,key:"unknown:base",gameSlug:"unknown"})).toBe(false);
  });
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
