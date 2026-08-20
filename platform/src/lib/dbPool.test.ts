import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Connection pool sizing for serverless.
 *
 * Mongoose defaults maxPoolSize to 100 — fine for one long-lived server, and
 * actively harmful across lambdas, where every instance opens its own pool. A
 * handful of concurrent instances then asks Atlas for several hundred
 * connections and the cluster starts refusing them: TLS completes, then the
 * server sends an internal-error alert, surfacing as a MongoNetworkError
 * labelled SystemOverloadedError. It looks exactly like an outage.
 *
 * Asserted against the source because the options are passed to a real
 * mongoose.connect that these tests must not make.
 */

const SOURCE = readFileSync("src/lib/db.ts", "utf8");

function numericOption(name: string): number | null {
  const match = SOURCE.match(new RegExp(`${name}:\\s*([0-9_]+)`));
  return match ? Number(match[1].replace(/_/g, "")) : null;
}

describe("mongo connection options", () => {
  it("caps the pool well below the driver default", () => {
    const max = numericOption("maxPoolSize");
    expect(max, "maxPoolSize must be set explicitly").not.toBeNull();
    // 100 is the default that caused this; anything near it defeats the point.
    expect(max!).toBeLessThanOrEqual(10);
    expect(max!).toBeGreaterThan(0);
  });

  it("does not hold idle sockets open indefinitely", () => {
    // An idle lambda sitting on connections starves the rest of the fleet.
    expect(numericOption("maxIdleTimeMS")).not.toBeNull();
  });

  it("fails faster than a lambda times out", () => {
    /*
     * The driver default is 30s. A request that spends that long selecting a
     * server has already lost — better to surface the failure while there is
     * still time to serve something.
     */
    const selection = numericOption("serverSelectionTimeoutMS");
    expect(selection).not.toBeNull();
    expect(selection!).toBeLessThanOrEqual(15_000);
  });

  it("still reuses one cached connection per instance", () => {
    // The cache is what keeps a warm lambda from reconnecting per request.
    expect(SOURCE).toContain("global.__mongooseCache");
    expect(SOURCE).toMatch(/if \(cached\.conn\)\s*\{\s*return cached\.conn;/);
  });

  it("clears the cached promise on failure so the next call can retry", () => {
    // Without this a single failed connect poisons the instance permanently.
    expect(SOURCE).toMatch(/catch[\s\S]{0,60}cached\.promise = null;/);
  });
});
