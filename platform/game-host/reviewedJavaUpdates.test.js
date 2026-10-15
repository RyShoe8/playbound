import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { verifyReviewedJava, stageReviewedJava } from "./reviewedJavaUpdates.js";
const sha = data => createHash("sha256").update(data).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-java-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = Buffer.from("reviewed server fixture"); fs.writeFileSync(path.join(root, "server.jar"), data, { mode: 0o644 });
  return { root, profile: { component: "server.jar", jar: "server.jar", java: "/usr/bin/java", mainClass: "Server", versions: [{ buildId: "old", sha256: sha(data), bytes: data.length }] } };
}
test("pinned JAR requires matching bytes, server entry point and compatible installed Java", t => {
  const f = fixture(t);
  const command = (_exe, args) => args[0] === "--version" ? Buffer.from("openjdk 21.0.1") : Buffer.from('{"java":25}');
  assert.throws(() => verifyReviewedJava(f.root, "ysoccer", { profile: f.profile, command }), /compatible installed Java/);
  assert.deepEqual(verifyReviewedJava(f.root, "ysoccer", { profile: f.profile, command: (_exe, args) => args[0] === "--version" ? Buffer.from("openjdk 25.0.1") : Buffer.from('{"java":25}') }), { buildId: "old" });
  fs.appendFileSync(path.join(f.root, "server.jar"), "modified");
  assert.throws(() => verifyReviewedJava(f.root, "ysoccer", { profile: f.profile, command }), /differs/);
});
test("failed or untrusted artifact download leaves the staged JAR intact", async t => {
  const f = fixture(t), stage = path.join(f.root, ".pb-update-ysoccer-00000000-0000-0000-0000-000000000000"); fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, "server.jar"), "original");
  const profile = { ...f.profile, latest: "new", versions: [{ buildId: "new", url: "https://github.com/RyShoe8/playbound/releases/download/ysoccer-online-latest/ysoccer-server.jar", archiveBytes: 20, archiveSha256: "0".repeat(64) }] };
  await assert.rejects(stageReviewedJava(stage, "ysoccer", { profile, verify: () => ({}), request: async () => new Response(null, { status: 302, headers: { location: "https://untrusted.test/server.jar" } }) }), /not trusted/);
  await assert.rejects(stageReviewedJava(stage, "ysoccer", { profile, verify: () => ({}), request: async () => new Response("bad") }), /SHA-256/);
  assert.equal(fs.readFileSync(path.join(stage, "server.jar"), "utf8"), "original");
});
