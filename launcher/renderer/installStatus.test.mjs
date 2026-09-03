/**
 * How an install describes itself while it is running.
 *
 * The complaint these exist for: a game that is installing but looks stopped.
 * Every assertion here is about saying something true that visibly changes.
 *
 * Run: node renderer/installStatus.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { fmtEta, fmtElapsed, fmtRate, fmtBytes } from "./shared.js";

test("a remaining time is rounded to what the number can support", () => {
  /*
   * The estimate comes from the last few seconds of a connection. "about 4m"
   * survives that being a bit wrong; "4m 12s" reads as a promise, and once it
   * slips the whole readout stops being believed.
   */
  assert.equal(fmtEta(45_000), "about 45s left");
  assert.equal(fmtEta(90_000), "about 2m left");
  assert.equal(fmtEta(20 * 60_000), "about 20m left");
  assert.equal(fmtEta(80 * 60_000), "about 1h 20m left");
  assert.equal(fmtEta(120 * 60_000), "about 2h left");
});

test("the last seconds say almost done rather than counting to zero", () => {
  // A countdown ticking 3, 2, 1 while a file finishes writing invites someone
  // to think it stalled at the end.
  assert.equal(fmtEta(2000), "almost done");
  assert.equal(fmtEta(0), "almost done");
});

test("says nothing when there is nothing to say", () => {
  // No content-length, or the meter still gathering samples. An empty string
  // drops out of the joined status line instead of printing "null".
  assert.equal(fmtEta(null), "");
  assert.equal(fmtEta(undefined), "");
  assert.equal(fmtEta(-1), "");
  assert.equal(fmtRate(null), "");
  assert.equal(fmtRate(0), "");
});

test("a rate reads as a rate", () => {
  assert.equal(fmtRate(8 * 1e6), "8 MB/s");
  assert.equal(fmtRate(1.5 * 1e9), "1.50 GB/s");
});

test("elapsed is m:ss, because a step with no bytes still needs a moving number", () => {
  assert.equal(fmtElapsed(0), "0:00");
  assert.equal(fmtElapsed(42_000), "0:42");
  assert.equal(fmtElapsed(135_000), "2:15");
  assert.equal(fmtElapsed(3_600_000), "60:00");
  assert.equal(fmtElapsed(null), "");
});

test("a download line stays readable when only some of it is known", () => {
  // The three parts are joined with separators and any of them can be absent:
  // no total early on, no rate for the first second, no ETA without a total.
  const line = (size, rate, eta) => [size, rate, eta].filter(Boolean).join(" · ");
  assert.equal(
    line(`${fmtBytes(45e6)} of ${fmtBytes(104e6)} (43%)`, fmtRate(8e6), fmtEta(7000)),
    "45 MB of 104 MB (43%) · 8 MB/s · about 7s left"
  );
  assert.equal(line(fmtBytes(45e6), fmtRate(null), fmtEta(null)), "45 MB");
});
