const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");
const { writeDownloadBody } = require("./downloadBody");

test("completes and closes the archive before extraction can read it", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "pb-download-test-"));
  try {
    const dest = path.join(dir, "archive.zip");
    const output = fs.createWriteStream(dest);
    let received = 0;
    await writeDownloadBody(new Response("archive contents").body, output, {
      onChunk: (bytes) => { received += bytes; },
    });
    assert.equal(await fsp.readFile(dest, "utf8"), "archive contents");
    assert.equal(received, 16);
    assert.equal(output.closed, true);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("file-open denial rejects to the install caller rather than emitting an uncaught error", { timeout: 2000 }, async () => {
  const denied = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
  const output = new Writable({
    construct(callback) { callback(denied); },
    write(chunk, encoding, callback) { callback(); },
  });
  await assert.rejects(writeDownloadBody(new Response("archive").body, output), { code: "EPERM" });
  assert.equal(output.destroyed, true);
});

test("a write failure while waiting for drain rejects without hanging", { timeout: 2000 }, async () => {
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      setImmediate(() => callback(Object.assign(new Error("disk full"), { code: "ENOSPC" })));
    },
  });
  await assert.rejects(writeDownloadBody(new Response("large chunk").body, output), { code: "ENOSPC" });
  assert.equal(output.destroyed, true);
});

test("a network failure closes the file so the next attempt can overwrite it", { timeout: 2000 }, async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "pb-download-test-"));
  try {
    const dest = path.join(dir, "archive.zip");
    const output = fs.createWriteStream(dest);
    const body = new ReadableStream({
      start(controller) { controller.error(new Error("connection reset")); },
    });
    await assert.rejects(writeDownloadBody(body, output), /connection reset/);
    assert.equal(output.closed, true);
    await writeDownloadBody(new Response("retry succeeds").body, fs.createWriteStream(dest));
    assert.equal(await fsp.readFile(dest, "utf8"), "retry succeeds");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("cancellation interrupts stalled downloads and destroys the writer", { timeout: 2000 }, async () => {
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const downloading = writeDownloadBody(body, output, { signal: controller.signal });
  controller.abort();
  await assert.rejects(downloading, { name: "AbortError" });
  assert.equal(output.destroyed, true);
  assert.equal(cancelled, true);
});
