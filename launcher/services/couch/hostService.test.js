/**
 * hostService's `onSlotFrame` hook and session `solo` flag (no Electron, no
 * network — `createSession`'s HTTP/ViGEm dependencies are never exercised
 * here since `applyInput` needs none of that to resolve a bound frame).
 *
 * These protect the two pieces PlayBound Controls' phone-input support
 * actually depends on: every successfully-bound input frame reaches the
 * hook with the resolved slot and state (regardless of whether a ViGEm
 * handle exists yet for that slot), and the hook's own failure can never
 * break the couch input path it's observing.
 */

"use strict";

const assert = require("assert");

/*
 * Swap in the null (no-subprocess) virtual-controller provider before
 * hostService.js is first required — its own `createProvider` destructure
 * then picks up this patched version. Without this, `applyInput`'s
 * "no handle yet" branch spawns the real ViGEm sidecar on Windows, which
 * would leak a process out of every test run.
 */
const virtualControllerProvider = require("./VirtualControllerProvider");
virtualControllerProvider.createProvider = () =>
  virtualControllerProvider.createNullProvider("hostService.test.js — no real ViGEm host");

const { createHostService } = require("./hostService");
const { BUTTON } = require("./protocol");

function packet(overrides = {}) {
  return { v: 1, seq: 1, t: Date.now(), p: 0, buttons: BUTTON.A, lx: 0.5, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, ...overrides };
}

/* ── onSlotFrame fires with the resolved slot and bound state ───────────── */

{
  const seen = [];
  const host = createHostService({
    getApiBase: () => "https://example.invalid",
    onSlotFrame: (slot, state) => seen.push({ slot, state }),
  });
  const ok = host.applyInput(packet(), { playerSlot: 2, controllerId: "c1" });
  assert.strictEqual(ok, true);
  assert.strictEqual(seen.length, 1, "onSlotFrame must fire exactly once per bound frame");
  assert.strictEqual(seen[0].slot, 2, "slot must come from the authenticated binding (meta.playerSlot), not the packet");
  assert.strictEqual(seen[0].state.buttons & BUTTON.A, BUTTON.A);
}

/* ── A packet the auth layer refuses (no playerSlot) never reaches the hook ── */

{
  const seen = [];
  const host = createHostService({
    getApiBase: () => "https://example.invalid",
    onSlotFrame: (slot, state) => seen.push({ slot, state }),
  });
  const ok = host.applyInput(packet(), {});
  assert.strictEqual(ok, false);
  assert.strictEqual(seen.length, 0, "an unbound packet must never reach onSlotFrame");
}

/* ── A throwing hook must not break the couch input path it observes ────── */

{
  const host = createHostService({
    getApiBase: () => "https://example.invalid",
    onSlotFrame: () => {
      throw new Error("boom");
    },
  });
  assert.doesNotThrow(() => {
    const ok = host.applyInput(packet(), { playerSlot: 0 });
    assert.strictEqual(ok, true, "applyInput must still report success despite the hook throwing");
  });
}

/* ── onSlotFrame is optional — omitting it must not break anything ──────── */

{
  const host = createHostService({ getApiBase: () => "https://example.invalid" });
  assert.doesNotThrow(() => host.applyInput(packet(), { playerSlot: 0 }));
}

/*
 * `solo` on the session record: exercising this end-to-end would mean
 * mocking `fetch` and the ViGEm driver probe just to check one field
 * assignment, which is disproportionate — asserted against the source
 * instead, the same way this codebase already does for main.js-level glue
 * that's too heavy to run directly (see AdminNav.test.ts's `toContain`
 * checks). If this line is ever removed or renamed, `applyControllerConfig`
 * in main.js would silently stop being able to tell a solo phone session
 * from a real couch party.
 */
{
  const fs = require("fs");
  const source = fs.readFileSync(require.resolve("./hostService"), "utf8");
  assert.match(source, /solo:\s*Boolean\(opts\.solo\)/, "createSession must carry opts.solo onto the session record");
}

console.log("host service onSlotFrame ok");
