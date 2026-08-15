/**
 * decideSync tests. Run with: npm run test:saves
 *
 * This is the function that decides whether progress moves up or down, so it is
 * covered exhaustively — including every case where the correct answer is
 * "don't guess".
 */
const assert = require("assert");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const { decideSync, newestMtime } = require("./CloudSaves");

let pass = 0;
let fail = 0;
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

const T = (mins) => new Date(Date.UTC(2026, 0, 1, 0, mins)).toISOString();

async function main() {
  await check("does nothing when neither side has saves", () =>
    assert.equal(decideSync({ localUpdatedAt: null, remoteUpdatedAt: null, lastSyncedAt: null }).action, "noop"));

  await check("downloads when only the cloud has saves", () =>
    assert.equal(decideSync({ localUpdatedAt: null, remoteUpdatedAt: T(5), lastSyncedAt: null }).action, "download"));

  await check("uploads when only this machine has saves", () =>
    assert.equal(decideSync({ localUpdatedAt: T(5), remoteUpdatedAt: null, lastSyncedAt: null }).action, "upload"));

  await check("does nothing when both sides match", () =>
    assert.equal(decideSync({ localUpdatedAt: T(10), remoteUpdatedAt: T(10), lastSyncedAt: T(10) }).action, "noop"));

  await check("tolerates small clock skew between machines", () => {
    const a = new Date(Date.UTC(2026, 0, 1, 0, 10, 0)).toISOString();
    const b = new Date(Date.UTC(2026, 0, 1, 0, 10, 3)).toISOString(); // 3s apart
    assert.equal(decideSync({ localUpdatedAt: a, remoteUpdatedAt: b, lastSyncedAt: a }).action, "noop");
  });

  await check("uploads when only this machine advanced since last sync", () =>
    assert.equal(
      decideSync({ localUpdatedAt: T(30), remoteUpdatedAt: T(10), lastSyncedAt: T(10) }).action,
      "upload"
    ));

  await check("downloads when only another device advanced", () =>
    assert.equal(
      decideSync({ localUpdatedAt: T(10), remoteUpdatedAt: T(30), lastSyncedAt: T(10) }).action,
      "download"
    ));

  await check("reports a conflict when BOTH advanced since last sync", () => {
    // The case that matters: newest-wins would silently discard the older
    // edit, which may be a long session on another machine.
    const d = decideSync({ localUpdatedAt: T(40), remoteUpdatedAt: T(30), lastSyncedAt: T(10) });
    assert.equal(d.action, "conflict");
  });

  await check("conflict does not depend on which side is newer", () => {
    const d = decideSync({ localUpdatedAt: T(30), remoteUpdatedAt: T(40), lastSyncedAt: T(10) });
    assert.equal(d.action, "conflict");
  });

  await check("reports a conflict on first sync when both sides already have saves", () =>
    assert.equal(
      decideSync({ localUpdatedAt: T(30), remoteUpdatedAt: T(20), lastSyncedAt: null }).action,
      "conflict"
    ));

  await check("never silently discards: an impossible state uploads rather than overwrites", () => {
    // Both older than the recorded sync — shouldn't happen, but uploading is
    // additive and loses nothing, where downloading would replace local files.
    const d = decideSync({ localUpdatedAt: T(5), remoteUpdatedAt: T(6), lastSyncedAt: T(60) });
    assert.equal(d.action, "upload");
  });

  await check("every decision carries a reason", () => {
    const cases = [
      { localUpdatedAt: null, remoteUpdatedAt: null, lastSyncedAt: null },
      { localUpdatedAt: T(1), remoteUpdatedAt: null, lastSyncedAt: null },
      { localUpdatedAt: T(40), remoteUpdatedAt: T(30), lastSyncedAt: T(10) },
    ];
    for (const c of cases) assert.ok(decideSync(c).reason.length > 10);
  });

  await check("newestMtime finds the deepest changed file", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-mtime-"));
    await fsp.mkdir(path.join(tmp, "a", "b"), { recursive: true });
    await fsp.writeFile(path.join(tmp, "old.sav"), "x");
    await new Promise((r) => setTimeout(r, 20));
    await fsp.writeFile(path.join(tmp, "a", "b", "deep.sav"), "y");
    const newest = await newestMtime(fsp, path, tmp);
    const deep = (await fsp.stat(path.join(tmp, "a", "b", "deep.sav"))).mtimeMs;
    assert.ok(Math.abs(Date.parse(newest) - deep) < 1000);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await check("newestMtime returns null for an empty tree", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-mtime-"));
    assert.equal(await newestMtime(fsp, path, tmp), null);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
