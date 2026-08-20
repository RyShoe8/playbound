import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * What a failed catalog read does, which depends on when it happens.
 *
 * This behaviour has now been wrong in both directions, so it is worth pinning:
 *
 *   Returning [] made a failed read indistinguishable from an empty catalog.
 *   /games is prerendered, so one Mongo hiccup during a build baked a games
 *   page with no games into static HTML and served it for hours.
 *
 *   Throwing everywhere fixed that and broke deploys instead — an Atlas wobble
 *   became a red build twice in one evening, on a page whose content was
 *   already known.
 *
 * The rule is: a build falls back to seed, which is real content and never
 * empty; a request rethrows, so Next keeps serving the last good page. Asserted
 * against the source because the branch is inside a private function whose
 * other path needs a live database.
 */

const SOURCE = readFileSync("src/lib/catalog.ts", "utf8");

function fromMongoBody(): string {
  const start = SOURCE.indexOf("async function fromMongo(");
  expect(start, "fromMongo should exist").toBeGreaterThan(-1);
  // Far enough to cover the whole catch, short enough not to swallow the file.
  return SOURCE.slice(start, start + 2200);
}

describe("a failed catalog read", () => {
  const body = fromMongoBody();

  it("never silently returns an empty list", () => {
    // The regression that served an empty games page. `return []` in this
    // catch is the exact shape that must not come back.
    const catchBlock = body.slice(body.indexOf("} catch"));
    expect(catchBlock).not.toMatch(/return\s*\[\s*\]\s*;/);
  });

  it("falls back to seed during a production build", () => {
    expect(body).toContain('process.env.NEXT_PHASE === "phase-production-build"');
    expect(body).toContain("seedGames.map(seedGameWithInstall)");
  });

  it("rethrows at request time", () => {
    expect(body).toMatch(/throw new Error\(\s*`Catalog read failed:/);
  });

  it("keeps the seed fallback ahead of the throw", () => {
    // Order is the whole mechanism: throwing first would make the build branch
    // unreachable and put us back to failing deploys.
    const guard = body.indexOf("phase-production-build");
    // Regex, not indexOf: the throw wraps across two lines in the source.
    const thrown = body.search(/throw new Error\(\s*`Catalog read failed:/);
    expect(guard).toBeGreaterThan(-1);
    expect(thrown).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(thrown);
  });

  it("still logs the underlying error either way", () => {
    expect(body).toContain('console.error("[catalog] Mongo read failed:"');
  });
});
