import { describe, expect, it, vi } from "vitest";
import { createLiveActivityLimiter } from "./liveActivityLimiter";

describe("live activity limiter", () => {
  it("runs no more than two refreshes at once and releases slots after failures", async () => {
    const withPermit = createLiveActivityLimiter(2);
    const releases: Array<() => void> = [];
    let running = 0;
    let peak = 0;
    const task = (fail = false) => withPermit(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
      if (fail) throw new Error("unavailable");
      return "ok";
    });

    const jobs = [task(), task(true), task(), task()].map((promise) =>
      promise.then(
        (value) => ({ status: "fulfilled", value }),
        () => ({ status: "rejected" })
      )
    );
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(running).toBe(2);
    expect(releases).toHaveLength(2);
    releases.shift()?.();
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(peak).toBe(2);
    expect(releases).toHaveLength(2);
    releases.shift()?.();
    releases.shift()?.();
    expect(await Promise.all(jobs)).toMatchObject([
      { status: "fulfilled", value: "ok" },
      { status: "rejected" },
      { status: "fulfilled", value: "ok" },
      { status: "fulfilled", value: "ok" },
    ]);
    expect(running).toBe(0);
  });
});
