"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkWithHandledDownload, safeUpdateError } = require("./updateDownload");

test("download rejection is handled after the update check already returned", async () => {
  let reject, observed;
  const downloadPromise = new Promise((_, fail) => { reject = fail; });
  const result = await checkWithHandledDownload({ checkForUpdates: async () => ({ downloadPromise }) }, error => { observed = error.message; }, { retryLimit: 0 });
  assert.equal(result.downloadPromise, downloadPromise);
  reject(new Error("HTTP 503"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(observed, "HTTP 503");
});
test("check failures propagate, observer failures do not", async () => {
  await assert.rejects(checkWithHandledDownload({ checkForUpdates: async () => { throw new Error("feed unavailable"); } }), /feed unavailable/);
  await checkWithHandledDownload({ checkForUpdates: async () => ({ downloadPromise: Promise.reject(new Error("503")) }) }, () => { throw new Error("observer failed"); });
  await new Promise(resolve => setImmediate(resolve));
});
test("signed download URLs are removed from diagnostic messages", () => {
  assert.equal(safeUpdateError(new Error('Cannot download "https://storage.test/file.exe?X-Amz-Signature=private", status 503')), 'Cannot download "[download URL]", status 503');
});
test("temporary 503 downloads retry twice using fresh checks, then stop", async () => {
  let checks = 0; const timers = [];
  const updater = { checkForUpdates: async () => { checks++; return { downloadPromise: Promise.reject(new Error("status 503")) }; } };
  const schedule = (callback, delay) => { timers.push({ callback, delay }); return () => {}; };
  await checkWithHandledDownload(updater, () => {}, { schedule });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers[0].delay, 15000); timers.shift().callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers[0].delay, 30000); timers.shift().callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 3); assert.equal(timers.length, 0);
});
