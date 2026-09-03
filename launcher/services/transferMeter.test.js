/**
 * Run: node services/transferMeter.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTransferMeter } = require("./transferMeter");

const MB = 1024 * 1024;

test("says nothing until there is enough signal to divide by", () => {
  // Chunk arrival is bursty. A rate computed over the first 200ms swings
  // between numbers that are both wrong, and a wrong ETA is worse than none.
  const meter = createTransferMeter();
  assert.deepEqual(meter.update(0, 100 * MB, 0), { bytesPerSecond: null, etaMs: null });
  assert.deepEqual(meter.update(2 * MB, 100 * MB, 200), { bytesPerSecond: null, etaMs: null });
});

test("reports a rate and an ETA once it has a second of samples", () => {
  const meter = createTransferMeter();
  meter.update(0, 100 * MB, 0);
  const { bytesPerSecond, etaMs } = meter.update(10 * MB, 100 * MB, 1000);
  assert.equal(bytesPerSecond, 10 * MB);
  // 90 MB left at 10 MB/s.
  assert.equal(etaMs, 9000);
});

test("follows a download that slows down instead of averaging it away", () => {
  /*
   * The case a cumulative average gets wrong: fast for a moment, then
   * throttled. The window has to forget the fast part or the ETA it produces
   * keeps growing while claiming to shrink.
   */
  const meter = createTransferMeter({ windowMs: 4000 });
  meter.update(0, 200 * MB, 0);
  meter.update(90 * MB, 200 * MB, 1000); // a fast opening second
  let rate = null;
  for (let t = 2000; t <= 9000; t += 1000) {
    // 2 MB per second from here on.
    rate = meter.update(90 * MB + ((t - 1000) / 1000) * 2 * MB, 200 * MB, t).bytesPerSecond;
  }
  assert.ok(rate < 3 * MB, `expected the throttled rate, got ${rate}`);
  assert.ok(rate > 1.5 * MB, `expected roughly 2 MB/s, got ${rate}`);
});

test("gives no ETA when the server never said how big the file is", () => {
  // content-length is absent often enough to matter; bytes and a rate are
  // still worth showing, a made-up total is not.
  const meter = createTransferMeter();
  meter.update(0, 0, 0);
  const { bytesPerSecond, etaMs } = meter.update(5 * MB, 0, 1000);
  assert.equal(bytesPerSecond, 5 * MB);
  assert.equal(etaMs, null);
});

test("starts over when a retry restarts the file", () => {
  /*
   * downloadTo retries, and a retry begins at zero. Carrying the old samples
   * across would compute a negative rate and an ETA in the past.
   */
  const meter = createTransferMeter();
  meter.update(0, 100 * MB, 0);
  meter.update(40 * MB, 100 * MB, 2000);
  const afterRetry = meter.update(0, 100 * MB, 2500);
  assert.equal(afterRetry.bytesPerSecond, null);
  assert.equal(afterRetry.etaMs, null);

  const resumed = meter.update(8 * MB, 100 * MB, 3500);
  assert.equal(resumed.bytesPerSecond, 8 * MB);
});

test("does not report an ETA once the bytes are all in", () => {
  const meter = createTransferMeter();
  meter.update(0, 10 * MB, 0);
  const done = meter.update(10 * MB, 10 * MB, 1000);
  assert.equal(done.etaMs, null);
});

test("survives a stalled connection without dividing by zero", () => {
  // Nothing arriving is a real state — the window fills with identical byte
  // counts and the rate has to be absent rather than 0 or Infinity.
  const meter = createTransferMeter({ windowMs: 3000 });
  meter.update(5 * MB, 100 * MB, 0);
  let last = null;
  for (let t = 1000; t <= 6000; t += 1000) last = meter.update(5 * MB, 100 * MB, t);
  assert.equal(last.bytesPerSecond, null);
  assert.equal(last.etaMs, null);
});
