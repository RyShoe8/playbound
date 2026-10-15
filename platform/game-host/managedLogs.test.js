import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readManagedLog, readCapturedLogFile, retainCapturedLog, retainManagedLogs, managedLogFiles, redactLogLine, LOG_READ_BYTES, LOG_RETAIN_BYTES, withLogLock } from "./managedLogs.js";

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

test("retention keeps the writer inode and a bounded private tail", async () => fixture(async (root, filename) => {
  await fs.writeFile(filename, "old\n".repeat(LOG_RETAIN_BYTES / 4) + "recent\n", { mode: 0o600 });
  const writer = await fs.open(filename, "a");
  try {
    const before = await writer.stat();
    assert.equal(await retainCapturedLog(filename), true);
    assert.equal((await writer.stat()).ino, before.ino);
    assert.equal((await fs.stat(filename)).size, 0);
    assert.ok((await fs.stat(filename + ".previous")).size <= LOG_READ_BYTES);
    assert.ok((await readManagedLog(root, id)).lines.includes("recent"));
    await writer.write("still attached\n");
    assert.deepEqual((await readManagedLog(root, id)).lines, ["still attached"]);
    assert.equal(await retainCapturedLog(filename), false);
  } finally { await writer.close(); }
}));

test("retention waits for console operations using the same file", async () => fixture(async (_root, filename) => {
  await fs.writeFile(filename, "x\n".repeat(LOG_RETAIN_BYTES / 2) + "end\n", { mode: 0o600 });
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const command = withLogLock(filename, async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await ready;
  let complete = false;
  const retention = retainCapturedLog(filename).then(value => { complete = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(complete, false);
  release();
  await command;
  assert.equal(await retention, true);
}));

test("fixed RimWorld roots support stopped server logs and never scan arbitrary files", async () => fixture(async (home, _filename) => {
  const directory = path.join(home, "managed-logs");
  const paths = managedLogFiles(directory, home, id);
  await fs.mkdir(path.dirname(paths[1]), { recursive: true });
  await fs.writeFile(paths[1], "Ready\n", { mode: 0o600 });
  assert.deepEqual((await readCapturedLogFile(paths[1])).lines, ["Ready"]);
  const unrelated = path.join(home, "important.log");
  await fs.writeFile(unrelated, "do not alter");
  assert.deepEqual(await retainManagedLogs(directory, home), { rotated: 0, failed: 0 });
  assert.equal(await fs.readFile(unrelated, "utf8"), "do not alter");
  assert.throws(() => managedLogFiles(directory, home, "../other"));
}));

test("retention refuses links and a linked ancestor directory", { skip: process.platform === "win32" }, async () => fixture(async (root, filename) => {
  const privateFile = path.join(root, "private");
  await fs.writeFile(privateFile, "private\n");
  await fs.symlink(privateFile, filename);
  await assert.rejects(retainCapturedLog(filename), /Unsafe log file/);
  const link = path.join(root, "linked-root");
  await fs.symlink(root, link);
  await assert.rejects(readCapturedLogFile(path.join(link, "private")), /Unsafe log directory/);
  assert.equal(await fs.readFile(privateFile, "utf8"), "private\n");
}));
