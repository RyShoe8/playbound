import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageXonoticRelease } from "./xonoticUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-xonotic-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, ".pb-update-xonotic-01234567-0123-4123-8123-0123456789ab");
  fs.mkdirSync(stage);
  const native = path.join(stage, "xonotic-linux64-dedicated"); fs.writeFileSync(native, "preserved baseline");
  return { stage, native };
}
test("Xonotic refuses arbitrary stage paths before download or execution", async () => {
  await assert.rejects(stageXonoticRelease("/tmp/arbitrary", { request: assert.fail, run: assert.fail }), /isolated worker/);
});
test("invalid publisher archives preserve the native engine and leave no downloads", async t => {
  const { stage, native } = fixture(t);
  const response = Readable.from([Buffer.from("not the publisher archive")]);
  await assert.rejects(stageXonoticRelease(stage, { verify: () => {}, run: assert.fail, request: async (url, options) => {
    assert.equal(url, "https://download.evil-ant-colony.org/xonotic/xonotic-0.8.6.zip");
    assert.equal(options.maxRedirects, 0);
    return { statusCode: 200, stream: response };
  } }), /SHA-512/);
  assert.equal(fs.readFileSync(native, "utf8"), "preserved baseline");
  assert.deepEqual(fs.readdirSync(stage), ["xonotic-linux64-dedicated"]);
  assert.ok(response.destroyed);
});
test("disk pressure stops the stream before extraction and preserves the old engine", async t => {
  const { stage, native } = fixture(t), response = Readable.from([Buffer.from("fixture")]);
  await assert.rejects(stageXonoticRelease(stage, { verify: () => {}, run: assert.fail, diskCheck: () => { throw new Error("disk reserve"); }, request: async () => ({ statusCode: 200, stream: response }) }), /disk reserve/);
  assert.equal(fs.readFileSync(native, "utf8"), "preserved baseline");
  assert.ok(response.destroyed);
});
test("Xonotic bounded ZIP extraction refuses traversal, links, duplicates and changed bytes", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./xonoticArchive.test.py", import.meta.url))], { timeout: 30000, stdio: "pipe" });
});

test("fresh installs retain the same reviewed mirror and publisher checksum", () => {
  const release = JSON.parse(fs.readFileSync(new URL("./xonotic086.json", import.meta.url), "utf8"));
  const install = fs.readFileSync(new URL("./install.sh", import.meta.url), "utf8");
  assert.ok(install.includes(release.url));
  assert.ok(install.includes(release.archiveSha512));
  assert.match(install, /sha512sum --check --status/);
});
