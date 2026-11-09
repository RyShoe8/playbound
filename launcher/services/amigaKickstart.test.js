"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { crc32, importKickstart, hasKickstart13, syncKickstarts, KNOWN_ROMS } = require("./amigaKickstart");
const { coreOptionsFor } = require("./retroArchLaunchConfig");

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), "cbf43926");
});

test("a file that is not a known Kickstart dump is refused with a reason", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pb-ks-"));
  try {
    const bogus = path.join(dir, "kick.rom");
    await fs.writeFile(bogus, Buffer.alloc(262144, 1));
    const result = await importKickstart(bogus, path.join(dir, "store"));
    assert.equal(result.ok, false);
    assert.match(result.error, /recognise/);
    await fs.writeFile(bogus, Buffer.alloc(1000));
    assert.match((await importKickstart(bogus, path.join(dir, "store"))).error, /256 KB or 512 KB/);
    assert.equal(hasKickstart13(path.join(dir, "store")), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("PUAE uses AROS without a Kickstart and the real ROM once one is synced in", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pb-ks-"));
  try {
    const store = path.join(dir, "store");
    const system = path.join(dir, "system");
    assert.deepEqual(coreOptionsFor("puae", system), { puae_kickstart: "aros" });
    // A stored ROM (contents irrelevant here) is copied across and switches PUAE to it.
    await fs.mkdir(store, { recursive: true });
    await fs.writeFile(path.join(store, KNOWN_ROMS.c4f0f55f.file), Buffer.alloc(262144));
    assert.equal(await syncKickstarts(store, system), 1);
    assert.equal(await syncKickstarts(store, system), 0);
    assert.deepEqual(coreOptionsFor("puae", system), { puae_kickstart: "auto" });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
