/**
 * Regression test for the stale-straggler cache bug.
 *
 * Symptom: install a game, the status area says it finished, and the hero
 * button stays on "Install Game". Cause: invalidating a key does not stop a
 * request already in the air, and that request still wrote its result when it
 * landed — so the pre-install payload dropped back into the cache after the
 * invalidation and the next read treated it as fresh.
 *
 * Run: node renderer/cache.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheInvalidate, cacheInvoke, cachePeek } from "./shared.js";

const TTL = 60_000;

/** A request we can resolve by hand, to control the ordering precisely. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("a request invalidated mid-flight does not repopulate the cache", async () => {
  cacheInvalidate();

  const slow = deferred();
  // The pre-install read, still in the air.
  const first = cacheInvoke("game:mindustry", TTL, () => slow.promise);

  // The install lands and invalidates everything it touched.
  cacheInvalidate("game:mindustry");

  // Only now does the stale read come back.
  slow.resolve({ installed: false });
  assert.deepEqual(await first, { installed: false }, "caller still gets its answer");

  assert.equal(
    cachePeek("game:mindustry", TTL),
    null,
    "stale payload must not be cached after the invalidation"
  );
});

test("the next read after an invalidation sees the new truth", async () => {
  cacheInvalidate();

  const slow = deferred();
  const first = cacheInvoke("game:mindustry", TTL, () => slow.promise);
  cacheInvalidate("game:mindustry");
  slow.resolve({ installed: false });
  await first;

  const fresh = await cacheInvoke("game:mindustry", TTL, async () => ({ installed: true }));
  assert.deepEqual(fresh, { installed: true });
  assert.deepEqual(
    cachePeek("game:mindustry", TTL)?.data,
    { installed: true },
    "the post-install payload is what sticks"
  );
});

test("an uninterrupted request still caches normally", async () => {
  cacheInvalidate();

  const data = await cacheInvoke("game:openra", TTL, async () => ({ installed: true }));
  assert.deepEqual(data, { installed: true });
  assert.deepEqual(cachePeek("game:openra", TTL)?.data, { installed: true });

  // Second call is served from cache without invoking the function again.
  let calls = 0;
  await cacheInvoke("game:openra", TTL, async () => {
    calls += 1;
    return { installed: false };
  });
  assert.equal(calls, 0, "a fresh entry short-circuits the fetch");
});
