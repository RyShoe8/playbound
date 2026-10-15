import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readManagedLog, redactLogLine, LOG_READ_BYTES } from "./managedLogs.js";

const id = "0123456789abcdef01234567";
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-logs-"));
  try { await run(root, path.join(root, `${id}.log`)); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
test("bounded tail omits partial edges and retains only 200 complete lines", async () => fixture(async (root, filename) => {
  await fs.writeFile(filename, "x".repeat(LOG_READ_BYTES) + "password=hidden\n" + Array.from({ length: 250 }, (_, i) => `row ${i}\n`).join("") + "unfinished");
  const result = await readManagedLog(root, id);
  assert.equal(result.lines.length, 200);
  assert.equal(result.lines[0], "row 50");
  assert.equal(result.lines.at(-1), "row 249");
  assert.equal(result.truncated, true);
}));
test("credentials, known secret values, URLs and terminal controls are scrubbed", () => {
  assert.equal(redactLogLine('rcon_password = "several secret words"'), "[credential-bearing line omitted]");
  assert.equal(redactLogLine("Steam login token abc"), "[credential-bearing line omitted]");
  assert.equal(redactLogLine("pass\x1b[31mword=hidden"), "[credential-bearing line omitted]");
  assert.equal(redactLogLine("value hidden-value", ["hidden-value"]), "value [redacted]");
  assert.equal(redactLogLine("a".repeat(32)), "[redacted]");
  assert.equal(redactLogLine("https://host/path?auth=abc"), "[URL omitted]");
  assert.equal(redactLogLine("\x1b[31mReady\x1b[0m\x00"), "Ready");
});
test("missing files are unavailable, invalid IDs never select paths", async () => fixture(async (root) => {
  assert.equal((await readManagedLog(root, id)).available, false);
  await assert.rejects(readManagedLog(root, "../private"), /Invalid server/);
}));
test("hard links and symlinks are rejected", async () => fixture(async (root, filename) => {
  const other = path.join(root, "private");
  await fs.writeFile(other, "private\n");
  await fs.link(other, filename);
  await assert.rejects(readManagedLog(root, id), /Unsafe log file/);
  await fs.unlink(filename);
  if (process.platform !== "win32") {
    await fs.symlink(other, filename);
    await assert.rejects(readManagedLog(root, id), /Unsafe log file/);
  }
}));
