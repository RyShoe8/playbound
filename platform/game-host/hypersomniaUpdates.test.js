import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { stageHypersomniaRelease, verifyHypersomniaInstallation } from "./hypersomniaUpdates.js";
import { verifySshArtifactSignature } from "./sshArtifactSignature.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";
import { runInstallationUpdate } from "./installationUpdateWorker.js";
import { recipes } from "./recipes.js";

const wire = (value) => { const data = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([size, data]); };
const keys = generateKeyPairSync("ed25519");
const publicKey = Buffer.concat([wire("ssh-ed25519"), wire(keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32))]);
function signature(data, namespace = "self_updater") {
  const version = Buffer.from([0, 0, 0, 1]), hash = createHash("sha512").update(data).digest();
  const message = Buffer.concat([Buffer.from("SSHSIG"), wire(namespace), wire(""), wire("sha512"), wire(hash)]);
  const signed = Buffer.concat([wire("ssh-ed25519"), wire(sign(null, message, keys.privateKey))]);
  const body = Buffer.concat([Buffer.from("SSHSIG"), version, wire(publicKey), wire(namespace), wire(""), wire("sha512"), wire(signed)]).toString("base64");
  return `-----BEGIN SSH SIGNATURE-----\n${body}\n-----END SSH SIGNATURE-----\n`;
}
function image() {
  const data = Buffer.alloc(512); data.writeUInt32BE(0x7f454c46); data[4] = 2; data[5] = 1; data.writeUInt16LE(62, 18);
  data.write("hsqs", 256); data.writeUInt32LE(131072, 268); data.writeUInt16LE(4, 284); data.writeBigUInt64LE(256n, 296); return data;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-hypersomnia-update-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function install(root, buildId = "3.0.0") {
  fs.mkdirSync(root, { recursive: true }); const data = image();
  fs.writeFileSync(path.join(root, "Hypersomnia-Headless.AppImage"), data, { mode: 0o755 });
  fs.writeFileSync(path.join(root, ".pb-hypersomnia-release.json"), JSON.stringify({ version: 1, buildId, size: data.length, digest: `sha256:${createHash("sha256").update(data).digest("hex")}` }));
}
function transport({ tamper = false, wrongVersion = false, oversized = false, truncate = false, downgrade = false, malformed = false } = {}) {
  const data = image(), signed = signature(data); if (tamper) data[511] = 1;
  const build = downgrade ? "2.9.9" : "3.1.0"; let executions = 0;
  return {
    executions: () => executions,
    request: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.ok(url.startsWith("https://hypersomnia.io/builds/latest/"));
      return url.endsWith(".txt") ? new Response(malformed ? "not a release" : `${build}\nCommit hash: ${"a".repeat(40)}\n${signed}`)
        : new Response(data, { headers: { "content-length": String(oversized ? 300 * 1024 ** 2 : data.length + (truncate ? 1 : 0)) } });
    },
    verifySignature: (file, sig, key) => {
      assert.equal(key, "AAAAC3NzaC1lZDI1NTE5AAAAILOAjiu83c1VUMG7nIPxok0+yIxqLzPmcZk4Dyr6IiVX");
      return verifySshArtifactSignature(file, sig, publicKey.toString("base64"));
    },
    run: async (command, args, options) => {
      executions++; assert.equal(command, "/usr/bin/env"); assert.equal(args[0], "-i");
      assert.ok(args[1].startsWith("--chdir=")); assert.ok(args.some((arg) => arg.startsWith("HOME=")));
      assert.deepEqual(args.slice(-2), ["--appimage-extract-and-run", "--version"]);
      assert.equal(options.timeout, 30_000); assert.equal(options.maxOutput, 8192);
      return `Hypersomnia version ${wrongVersion ? "0.0.0" : build}\n`;
    },
  };
}
test("party and managed launches cannot bypass coordinated updates", () => {
  for (const managed of [true, false]) {
    const args = recipes.hypersomnia.args(8412, { partyId: "test", managed });
    assert.ok(args.includes("--no-update-on-launch"));
    assert.ok(!args.includes("--daily-autoupdate"));
    assert.ok(!args.includes("--update-once-now"));
  }
});
test("OpenSSH artifact verification checks the pinned signer, namespace and exact image bytes", (t) => {
  const file = path.join(fixture(t), "image"); const data = image(); fs.writeFileSync(file, data);
  assert.equal(verifySshArtifactSignature(file, signature(data), publicKey.toString("base64")).size, data.length);
  assert.throws(() => verifySshArtifactSignature(file, signature(data), "other-key"), /not trusted/);
  assert.throws(() => verifySshArtifactSignature(file, signature(data, "hypersomnia"), publicKey.toString("base64")), /not trusted/);
  assert.throws(() => verifySshArtifactSignature(file, "invalid armor", publicKey.toString("base64")), /armor/);
  fs.appendFileSync(file, "tamper");
  assert.throws(() => verifySshArtifactSignature(file, signature(data), publicKey.toString("base64")), /failed/);
});
test("signed rolling build stages only after signature and isolated version validation", async (t) => {
  const stage = path.join(fixture(t), `.pb-update-hypersomnia-${randomUUID()}`); install(stage);
  const f = transport(); assert.equal((await stageHypersomniaRelease(stage, f)).buildId, "3.1.0");
  assert.equal(f.executions(), 1); assert.equal(verifyHypersomniaInstallation(stage).buildId, "3.1.0");
  assert.deepEqual(fs.readdirSync(stage).sort(), [".pb-hypersomnia-release.json", "Hypersomnia-Headless.AppImage"]);
});
for (const option of ["tamper", "wrongVersion", "oversized", "truncate", "downgrade", "malformed"]) {
  test(`refuses ${option} and preserves the staged previous image`, async (t) => {
    const stage = path.join(fixture(t), `.pb-update-hypersomnia-${randomUUID()}`); install(stage);
    const before = fs.readFileSync(path.join(stage, "Hypersomnia-Headless.AppImage")), f = transport({ [option]: true });
    await assert.rejects(stageHypersomniaRelease(stage, f));
    assert.deepEqual(fs.readFileSync(path.join(stage, "Hypersomnia-Headless.AppImage")), before);
    if (option !== "wrongVersion") assert.equal(f.executions(), 0);
  });
}
test("disk failures, redirects and oversized metadata fail before execution", async (t) => {
  for (const failure of ["disk", "redirect", "metadata"]) {
    const stage = path.join(fixture(t), `.pb-update-hypersomnia-${randomUUID()}`); install(stage);
    const f = transport();
    if (failure === "disk") f.diskCheck = () => { throw new Error("Update stopped to preserve free disk space"); };
    else f.request = async () => failure === "redirect" ? new Response(null, { status: 302, headers: { location: "https://other.example/image" } }) : new Response("x".repeat(9000));
    await assert.rejects(stageHypersomniaRelease(stage, f)); assert.equal(f.executions(), 0);
  }
});
test("custom installation content and non-worker paths cannot be overwritten", async (t) => {
  const stage = path.join(fixture(t), `.pb-update-hypersomnia-${randomUUID()}`); install(stage);
  fs.writeFileSync(path.join(stage, "custom-config.json"), "private data");
  assert.throws(() => verifyHypersomniaInstallation(stage), /custom/);
  await assert.rejects(stageHypersomniaRelease(path.dirname(stage), transport()), /isolated/);
});
test("signed-image worker uses the shared queue, player protection, activation and rollback", async (t) => {
  const root = fixture(t), gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state"), current = path.join(gamesRoot, "hypersomnia"); install(current);
  const rooms = [{ gameSlug: "hypersomnia" }], launches = [];
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => rooms, scan: async () => 0, launch: async (job) => launches.push(job) });
  const store = createInstallationStore(stateDir), update = coordinator.queue("hypersomnia", "update", "test");
  assert.throws(() => coordinator.beginStart("hypersomnia"), /paused/); await coordinator.tick(); assert.equal(launches.length, 0);
  rooms.length = 0; await coordinator.tick(); assert.equal(launches.length, 1);
  const options = { scan: async () => 0, disk: () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 }),
    run: async (command, args) => { if (command.endsWith("du")) return "512 fixture"; assert.ok(command.endsWith("cp")); fs.cpSync(args.at(-2), args.at(-1), { recursive: true }); return ""; },
    stageHypersomnia: (stage, options) => stageHypersomniaRelease(stage, { ...options, ...transport() }),
  };
  await runInstallationUpdate({ id: update.id, gamesRoot, stateDir }, options);
  assert.equal(store.read(update.id).status, "completed"); assert.equal(verifyHypersomniaInstallation(current).buildId, "3.1.0");
  const rollback = coordinator.queue("hypersomnia", "rollback", "test"); store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ id: rollback.id, gamesRoot, stateDir }, options);
  assert.equal(store.read(rollback.id).status, "completed"); assert.equal(verifyHypersomniaInstallation(current).buildId, "3.0.0");
});
