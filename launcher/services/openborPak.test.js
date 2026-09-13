const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  replacePackFile,
  readPackIndex,
  TMNT_LOGO_SCENE,
} = require("./openborPak");
const {
  applyOpenBorP1Keys,
  isOpenBorCfg,
  p1StillKeyboard,
  DUALSENSE_P1_KEYS,
  OPENBOR_CFG_VERSION,
  P1_KEYS_OFFSET,
} = require("./openborCfg");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed += 1;
  }
}

test("recognises OpenBOR cfg magic", () => {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  assert.equal(isOpenBorCfg(buf), true);
  assert.equal(p1StillKeyboard(buf), true);
});

test("writes DualSense P1 keys only while keyboard defaults remain", () => {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  // Default-ish keyboard arrows
  [0x111, 0x112, 0x114, 0x113].forEach((k, i) => buf.writeInt32LE(k, P1_KEYS_OFFSET + i * 4));
  const profile = { family: "dualsense", label: "PS5 Controller" };
  const next = applyOpenBorP1Keys(buf, profile);
  assert.ok(next);
  DUALSENSE_P1_KEYS.forEach((k, i) => {
    assert.equal(next.readInt32LE(P1_KEYS_OFFSET + i * 4), k);
  });
  assert.equal(applyOpenBorP1Keys(next, profile), null, "second apply must no-op");
});

test("rewrites DualSense template that left special on keyboard F", () => {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  // Broken first ship: joy dirs + jump, special still F
  const broken = [628, 630, 631, 629, 602, 601, 122, 120, 603, 102, 610, 614];
  broken.forEach((k, i) => buf.writeInt32LE(k, P1_KEYS_OFFSET + i * 4));
  const profile = { family: "dualsense", label: "PS5 Controller" };
  const next = applyOpenBorP1Keys(buf, profile);
  assert.ok(next);
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 4 * 4), 602, "attack btn2");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 8 * 4), 603, "jump btn3");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 9 * 4), 601, "special btn1");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 10 * 4), 610, "start btn10");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 11 * 4), 614, "screenshot btn14");
});

test("pads a shorter logo scene to the original pack entry size", () => {
  // Minimal fake pack: magic + version + one file + directory + headerstart
  const fileBody = Buffer.from(
    "#\tmusic\r\nanimation\tdata/scenes/support.gif 0 0 1\r\n" + "x".repeat(200),
    "latin1"
  );
  const name = "DATA\\scenes\\logo.txt";
  const nameBuf = Buffer.from(name + "\0", "latin1");
  const structSize = 12 + nameBuf.length;
  const fileStart = 8;
  const dir = Buffer.alloc(structSize);
  dir.writeUInt32LE(structSize, 0);
  dir.writeUInt32LE(fileStart, 4);
  dir.writeUInt32LE(fileBody.length, 8);
  nameBuf.copy(dir, 12);

  const headerStart = fileStart + fileBody.length;
  const buf = Buffer.concat([
    Buffer.from("PACK"),
    Buffer.from([0, 0, 0, 0]),
    fileBody,
    dir,
    Buffer.alloc(4),
  ]);
  buf.writeUInt32LE(headerStart, buf.length - 4);

  const before = readPackIndex(buf);
  assert.ok(before.get("data/scenes/logo.txt"));

  const result = replacePackFile(buf, "data/scenes/logo.txt", Buffer.from(TMNT_LOGO_SCENE, "latin1"));
  assert.equal(result.changed, true);
  const entry = readPackIndex(buf).get("data/scenes/logo.txt");
  const stored = buf.slice(entry.start, entry.start + entry.size).toString("latin1");
  assert.ok(stored.startsWith("# PlayBound: skip cross-promo"));
  assert.ok(!stored.includes("support.gif"));
  assert.equal(entry.size, fileBody.length);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
