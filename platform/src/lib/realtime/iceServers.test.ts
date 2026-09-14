import { afterEach, describe, expect, it } from "vitest";
import {
  defaultIceServers,
  multiplayerRelayServers,
  sessionIceServers,
  turnIceServers,
} from "./iceServers";

const ENV_KEYS = ["GAME_HOST_PUBLIC_IP", "STUN_PORT", "TURN_SHARED_SECRET"] as const;

describe("sessionIceServers", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (key in saved) {
        const v = saved[key];
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
        delete saved[key];
      }
    }
  });

  function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("always includes expanded public STUN", () => {
    setEnv("GAME_HOST_PUBLIC_IP", undefined);
    setEnv("TURN_SHARED_SECRET", undefined);
    const ice = defaultIceServers();
    const urls = ice.map((s) => s.urls);
    expect(urls).toContain("stun:stun.l.google.com:19302");
    expect(urls).toContain("stun:stun.cloudflare.com:3478");
    expect(urls).toContain("stun:global.stun.twilio.com:3478");
    expect(ice.some((s) => String(s.urls).startsWith("turn:"))).toBe(false);
  });

  it("adds VPS STUN and TURN when env is set", () => {
    setEnv("GAME_HOST_PUBLIC_IP", "203.0.113.10");
    setEnv("STUN_PORT", "3478");
    setEnv("TURN_SHARED_SECRET", "test-secret");
    const ice = sessionIceServers("sess-abc");
    expect(ice.map((s) => s.urls)).toContain("stun:203.0.113.10:3478");
    const turn = ice.find((s) => String(s.urls).startsWith("turn:"));
    expect(turn).toBeTruthy();
    expect(turn!.urls).toBe("turn:203.0.113.10:3478");
    expect(turn!.username).toMatch(/^\d+:sess-abc$/);
    expect(turn!.credential).toBeTruthy();
    expect(turnIceServers("sess-abc")).toHaveLength(1);
  });

  it("matches multiplayer relay shape", () => {
    setEnv("GAME_HOST_PUBLIC_IP", "203.0.113.10");
    setEnv("TURN_SHARED_SECRET", "test-secret");
    const relay = multiplayerRelayServers("room-1");
    expect(relay.stunServers.length).toBeGreaterThan(1);
    expect(relay.turnServers?.[0]?.urls).toBe("turn:203.0.113.10:3478");
  });
});
