/**
 * SaveData tests. Run with: npm run test:saves
 *
 * Exercised against a real filesystem rather than mocks, because the thing
 * being verified is what actually lands on disk when a restore replaces files
 * a player cannot get back any other way.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const assert = require("assert");

const { createSaveData, snapshotKey, isInside } = require("./SaveData");

let pass = 0;
let fail = 0;

/** Async-aware on purpose: a sync harness would silently pass any async body. */
async function check(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${label}\n        ${err.message}`);
    fail++;
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-saves-"));
  const snapRoot = path.join(tmp, "snapshots");
  const saveDir = path.join(tmp, "game", "saves");
  const sd = createSaveData({ snapshotRoot: snapRoot });

  await fsp.mkdir(path.join(saveDir, "profile"), { recursive: true });
  await fsp.mkdir(path.join(saveDir, "cache"), { recursive: true });
  await fsp.writeFile(path.join(saveDir, "slot1.sav"), "ORIGINAL-1");
  await fsp.writeFile(path.join(saveDir, "profile", "player.cfg"), "name=alice");
  await fsp.writeFile(path.join(saveDir, "cache", "junk.bin"), "x".repeat(1000));

  const first = await sd.snapshot("0ad", null, saveDir, { reason: "test" });
  await check("captures a snapshot", () => assert.equal(first.status, "captured"));
  await check("counts only real save files, skipping cache", () => assert.equal(first.files, 2));
  await check("cache directory is not copied", () =>
    assert.ok(!fs.existsSync(path.join(first.dir, "cache"))));
  await check("nested files are preserved", () =>
    assert.equal(fs.readFileSync(path.join(first.dir, "profile", "player.cfg"), "utf8"), "name=alice"));

  await new Promise((r) => setTimeout(r, 5));
  await fsp.writeFile(path.join(saveDir, "slot1.sav"), "PROGRESSED-2");
  await fsp.writeFile(path.join(saveDir, "slot2.sav"), "NEW-SLOT");
  const second = await sd.snapshot("0ad", null, saveDir, { reason: "test2" });

  await check("a later snapshot is a separate copy", () => assert.notEqual(second.id, first.id));
  await check("earlier snapshots are immutable", () =>
    assert.equal(fs.readFileSync(path.join(first.dir, "slot1.sav"), "utf8"), "ORIGINAL-1"));
  await check("lists snapshots newest first", async () => {
    const l = await sd.list("0ad", null);
    assert.equal(l.length, 2);
    assert.equal(l[0].id, second.id);
  });

  const restored = await sd.restore("0ad", null, saveDir, first.id);
  await check("restore returns the older save content", () =>
    assert.equal(fs.readFileSync(path.join(saveDir, "slot1.sav"), "utf8"), "ORIGINAL-1"));
  await check("restore records a safety snapshot", () => assert.ok(restored.safetySnapshot));
  await check("restore is reversible — replaced state is still on disk", () => {
    const safety = path.join(sd.gameRoot("0ad", null), restored.safetySnapshot);
    assert.equal(fs.readFileSync(path.join(safety, "slot1.sav"), "utf8"), "PROGRESSED-2");
    assert.equal(fs.readFileSync(path.join(safety, "slot2.sav"), "utf8"), "NEW-SLOT");
  });
  await check("snapshot metadata never lands in the game folder", () =>
    assert.ok(!fs.existsSync(path.join(saveDir, ".playbound-snapshot.json"))));

  await check("a missing save directory reports no-saves", async () =>
    assert.equal((await sd.snapshot("ghost", null, path.join(tmp, "nope"))).status, "no-saves"));
  await check("an empty save directory reports no-saves", async () => {
    const emptyDir = path.join(tmp, "empty");
    await fsp.mkdir(emptyDir, { recursive: true });
    assert.equal((await sd.snapshot("ghost", null, emptyDir)).status, "no-saves");
  });
  await check("an empty snapshot leaves no history behind", async () =>
    assert.equal((await sd.list("ghost", null)).length, 0));

  await check("editions keep separate save history", async () => {
    // Rat King Adventure and vanilla SPD share a game slug but must never
    // share saves.
    const forkDir = path.join(tmp, "fork", "saves");
    await fsp.mkdir(forkDir, { recursive: true });
    await fsp.writeFile(path.join(forkDir, "run.dat"), "FORK");
    await sd.snapshot("shattered-pixel-dungeon", "rat-king-adventure", forkDir, {});
    assert.equal((await sd.list("shattered-pixel-dungeon", null)).length, 0);
    assert.equal((await sd.list("shattered-pixel-dungeon", "rat-king-adventure")).length, 1);
  });

  await check("prune keeps the newest N", async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3));
      await fsp.writeFile(path.join(saveDir, "slot1.sav"), `GEN-${i}`);
      await sd.snapshot("0ad", null, saveDir, { reason: `gen${i}` });
    }
    const before = await sd.list("0ad", null);
    await sd.prune("0ad", null, 3);
    const after = await sd.list("0ad", null);
    assert.equal(after.length, 3);
    assert.equal(after[0].id, before[0].id);
  });

  await check("local snapshots are unlimited by default", async () => {
    // Local history costs the player's disk, not ours, and it is what makes a
    // bad restore recoverable — so nothing is capped unless a caller asks.
    const { policyFor } = require("./saveLocations");
    assert.equal(policyFor("luanti").maxSnapshotMb, Infinity);
    assert.equal(policyFor("luanti").keep, Infinity);
    assert.equal(policyFor("0ad").maxSnapshotMb, Infinity);
  });

  await check("cloud uploads are capped at 250MB on the free plan", async () => {
    const { canUploadSnapshot, cloudPolicyFor } = require("./saveLocations");
    assert.equal(cloudPolicyFor("free").maxSnapshotMb, 250);
    assert.equal(cloudPolicyFor("free").keepPerGame, 1);
    assert.equal(canUploadSnapshot(249 * 1024 * 1024), true);
    assert.equal(canUploadSnapshot(251 * 1024 * 1024), false);
  });

  await check("an explicit size limit is still honoured when passed", async () => {
    const bigDir = path.join(tmp, "big", "saves");
    await fsp.mkdir(bigDir, { recursive: true });
    await fsp.writeFile(path.join(bigDir, "world.dat"), Buffer.alloc(3 * 1024 * 1024));
    const r = await sd.snapshot("luanti", null, bigDir, { maxSnapshotMb: 1 });
    assert.equal(r.status, "too-large");
    assert.ok(r.bytes > r.limitBytes);
    // and nothing was written
    assert.equal((await sd.list("luanti", null)).length, 0);
  });

  await check("still snapshots a save directory under the limit", async () => {
    const okDir = path.join(tmp, "small", "saves");
    await fsp.mkdir(okDir, { recursive: true });
    await fsp.writeFile(path.join(okDir, "slot.sav"), Buffer.alloc(64 * 1024));
    const r = await sd.snapshot("openttd", null, okDir, { maxSnapshotMb: 1 });
    assert.equal(r.status, "captured");
  });

  await check("size measurement ignores caches, matching the copy", async () => {
    const d = path.join(tmp, "cachey", "saves");
    await fsp.mkdir(path.join(d, "cache"), { recursive: true });
    await fsp.writeFile(path.join(d, "real.sav"), Buffer.alloc(32 * 1024));
    await fsp.writeFile(path.join(d, "cache", "junk.bin"), Buffer.alloc(4 * 1024 * 1024));
    // Would exceed 1MB if the cache counted; it must not.
    const r = await sd.snapshot("naev", null, d, { maxSnapshotMb: 1 });
    assert.equal(r.status, "captured");
  });

  await check("isInside rejects traversal", () => {
    assert.equal(isInside("/root/../etc/passwd", "/root"), false);
    assert.equal(isInside("/root/sub/file", "/root"), true);
  });
  await check("snapshotKey strips path separators from slugs", () =>
    assert.ok(!snapshotKey("../evil", "../worse").includes("/")));
  await check("restore refuses a traversing snapshot id", async () => {
    let threw = false;
    try {
      await sd.restore("0ad", null, saveDir, "../../../etc");
    } catch {
      threw = true;
    }
    assert.ok(threw, "traversing id was not rejected");
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
