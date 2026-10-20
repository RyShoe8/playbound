import { afterEach, describe, expect, it, vi } from "vitest";
import { readLauncherKnown, rememberLauncherKnown } from "./launcherKnown";

describe("launcher known memory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to unknown, remembers once recorded, and survives broken storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    });
    expect(readLauncherKnown()).toBe(false);
    rememberLauncherKnown();
    expect(readLauncherKnown()).toBe(true);

    vi.stubGlobal("window", {
      localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    });
    expect(readLauncherKnown()).toBe(false);
    expect(() => rememberLauncherKnown()).not.toThrow();
  });
});
