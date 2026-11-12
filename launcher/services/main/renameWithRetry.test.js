"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { renameWithRetry } = require("./renameWithRetry");

const busy = (code = "EPERM") => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
const noWait = async () => {};

test("a rename blocked for a moment succeeds on a later attempt", async () => {
  let calls = 0;
  await renameWithRetry("a", "b", { wait: noWait, rename: async () => { if (++calls < 3) throw busy(); } });
  assert.equal(calls, 3);
});

test("errors other than a held file are not retried", async () => {
  let calls = 0;
  await assert.rejects(renameWithRetry("a", "b", { wait: noWait, rename: async () => { calls++; throw Object.assign(new Error("gone"), { code: "ENOENT" }); } }), /gone/);
  assert.equal(calls, 1);
});

test("without a copy fallback the last EPERM is thrown", async () => {
  await assert.rejects(renameWithRetry("a", "b", { attempts: 2, wait: noWait, rename: async () => { throw busy(); } }), (err) => err.code === "EPERM");
});

test("a rename that never frees up is completed by copying", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-rename-"));
  const from = path.join(root, "luanti.playbound-staging");
  const to = path.join(root, "luanti");
  fs.mkdirSync(path.join(from, "bin"), { recursive: true });
  fs.writeFileSync(path.join(from, "bin", "luanti.exe"), "exe");
  await renameWithRetry(from, to, { attempts: 2, wait: noWait, copyFallback: true, rename: async () => { throw busy(); } });
  assert.equal(fs.readFileSync(path.join(to, "bin", "luanti.exe"), "utf8"), "exe");
  assert.equal(fs.existsSync(from), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the copy fallback never writes over an existing destination", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-rename-"));
  const from = path.join(root, "staging");
  const to = path.join(root, "game");
  fs.mkdirSync(from); fs.mkdirSync(to);
  fs.writeFileSync(path.join(to, "keep.txt"), "player");
  await assert.rejects(renameWithRetry(from, to, { attempts: 1, wait: noWait, copyFallback: true, rename: async () => { throw busy(); } }), (err) => err.code === "EPERM");
  assert.equal(fs.readFileSync(path.join(to, "keep.txt"), "utf8"), "player");
  fs.rmSync(root, { recursive: true, force: true });
});
