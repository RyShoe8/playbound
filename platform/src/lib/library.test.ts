import { describe, expect, it } from "vitest";
import {
  hashLauncherToken,
  LAUNCHER_HANDOFF_TTL_MS,
  LAUNCHER_TOKEN_TTL_MS,
  mintLauncherHandoffCode,
  mintLauncherToken,
} from "@/lib/library";

describe("launcher tokens", () => {
  it("mints opaque tokens and hashes stably", () => {
    const token = mintLauncherToken();
    expect(token).toHaveLength(64);
    expect(hashLauncherToken(token)).toHaveLength(64);
    expect(hashLauncherToken(token)).toBe(hashLauncherToken(token));
    expect(hashLauncherToken(token)).not.toBe(hashLauncherToken(token + "x"));
  });

  it("mints short handoff codes distinct from durable tokens", () => {
    const code = mintLauncherHandoffCode();
    expect(code.length).toBeGreaterThanOrEqual(16);
    expect(code).not.toContain("+");
    expect(code).not.toContain("/");
    expect(LAUNCHER_HANDOFF_TTL_MS).toBe(2 * 60 * 1000);
    expect(LAUNCHER_TOKEN_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
