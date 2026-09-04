/**
 * shared.js's own uses of the cache still resolve.
 *
 * When request memoisation moved to cache.js, shared.js re-exported the four
 * names with `export { … } from "./cache.js"`. That forwards them to importers
 * but does NOT bind them locally, and shared.js calls cacheInvoke itself in
 * four places — so those callers became undefined references that would throw
 * ReferenceError the first time a card was hovered.
 *
 * Nothing caught it: cache.test.mjs exercises the exported functions, not
 * shared.js's internal callers, so the whole suite stayed green. Only the
 * build's no-undef gate failed. This covers the gap from the test side.
 *
 * Run: node renderer/sharedPrefetch.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";

/** Stub the preload bridge before shared.js is loaded. */
const calls = [];
globalThis.window = globalThis.window || {};
globalThis.window.playbound = {
  getGameDetail: async (slug) => {
    calls.push(`game:${slug}`);
    return { slug };
  },
  getModDetail: async (slug) => {
    calls.push(`mod:${slug}`);
    return { slug };
  },
  getEventDetail: async (id) => {
    calls.push(`event:${id}`);
    return { id };
  },
};

const shared = await import("./shared.js");

test("the prefetch helpers reach the IPC layer instead of throwing", async () => {
  calls.length = 0;
  shared.prefetchGameDetail("morrowind");
  shared.prefetchModDetail("some-mod");
  shared.prefetchEventDetail("evt-1");
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(calls, ["game:morrowind", "mod:some-mod", "event:evt-1"]);
});

test("what they fetched is in the cache afterwards", async () => {
  shared.prefetchGameDetail("openmw");
  await new Promise((r) => setTimeout(r, 50));
  const hit = shared.cachePeek("game:openmw", 60_000);
  assert.ok(hit, "prefetched detail was not cached");
  assert.deepEqual(hit.data, { slug: "openmw" });
  assert.equal(hit.fresh, true);
});

test("shared.js still re-exports the cache API for the views", () => {
  // Seven other renderer files import these through shared.js.
  for (const name of ["cachePeek", "cachePut", "cacheInvalidate", "cacheInvoke"]) {
    assert.equal(typeof shared[name], "function", `${name} is not exported from shared.js`);
  }
});

test("the re-exported functions are the same ones cache.js owns", async () => {
  const cache = await import("./cache.js");
  for (const name of ["cachePeek", "cachePut", "cacheInvalidate", "cacheInvoke"]) {
    assert.equal(shared[name], cache[name], `${name} is a different function via shared.js`);
  }
});

test("invalidating through shared.js clears what a prefetch cached", async () => {
  // Proves both halves talk to one Map, not a copy each.
  shared.prefetchGameDetail("tes3mp");
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(shared.cachePeek("game:tes3mp", 60_000));
  shared.cacheInvalidate("game");
  assert.equal(shared.cachePeek("game:tes3mp", 60_000), null);
});
