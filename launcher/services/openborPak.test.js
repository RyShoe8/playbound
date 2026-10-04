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
  JOY_LIST_FIRST,
  JOY_MAX_INPUTS,
  readPlayerKeys,
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
  const p1 = readPlayerKeys(next, 0);
  const p2 = readPlayerKeys(next, 1);
  assert.ok(
    p1.slice(0, 4).every((k) => k >= JOY_LIST_FIRST && k < JOY_LIST_FIRST + JOY_MAX_INPUTS),
    "P1 on joy port 0"
  );
  assert.ok(
    p2.slice(0, 4).every(
      (k) => k >= JOY_LIST_FIRST + JOY_MAX_INPUTS && k < JOY_LIST_FIRST + 2 * JOY_MAX_INPUTS
    ),
    "P2 on joy port 1"
  );
  assert.notEqual(p1[0], p2[0], "P1 and P2 joy bases must differ");
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
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 9 * 4), 605, "special btn5");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 10 * 4), 610, "start btn10");
  assert.equal(next.readInt32LE(P1_KEYS_OFFSET + 11 * 4), 614, "screenshot btn14");
});

test("upgrades the first DualSense template to the play-tested layout", () => {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  [628, 630, 631, 629, 602, 600, 122, 120, 603, 601, 610, 614].forEach((k, i) => buf.writeInt32LE(k, P1_KEYS_OFFSET + i * 4));
  const next = applyOpenBorP1Keys(buf, { family: "dualsense" });
  assert.ok(next);
  assert.deepEqual(readPlayerKeys(next, 0), [618, 619, 616, 617, 602, 601, 600, 604, 603, 605, 610, 614]);
  assert.equal(applyOpenBorP1Keys(next, { family: "dualsense" }), null, "second apply must no-op");
});

test("moves Xbox pads off the DualSense hat indices they do not have", () => {
  // Written by the old XBOX_P1_KEYS: Xbox buttons, DualSense hat 628-631.
  // An Xbox pad is 10 buttons + 5 axes + 1 hat, so its hat is 621-624 and
  // 628-631 do not exist — remote guests got face buttons and no movement.
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  const broken = [628, 630, 631, 629, 600, 601, 602, 603, 604, 605, 607, 606];
  broken.forEach((k, i) => buf.writeInt32LE(k, P1_KEYS_OFFSET + i * 4));
  const next = applyOpenBorP1Keys(buf, { family: "xbox", label: "Xbox Controller" });
  assert.ok(next);
  assert.deepEqual(readPlayerKeys(next, 0).slice(0, 4), [621, 623, 624, 622], "up down left right");
  assert.equal(applyOpenBorP1Keys(next, { family: "xbox" }), null, "second apply must no-op");
  assert.equal(applyOpenBorP1Keys(buf, { family: "dualsense" }), null, "a DualSense cfg is left alone");
});

test("rewrites cfg when P1 and P2 share the same joy port", () => {
  const buf = Buffer.alloc(348, 0);
  buf.writeUInt32LE(OPENBOR_CFG_VERSION, 0);
  // Both players on joy port 0 (host pad drives everyone).
  DUALSENSE_P1_KEYS.forEach((k, i) => {
    buf.writeInt32LE(k, P1_KEYS_OFFSET + i * 4);
    buf.writeInt32LE(k, P1_KEYS_OFFSET + 48 + i * 4);
  });
  const profile = { family: "xbox", label: "Phone Controller" };
  const next = applyOpenBorP1Keys(buf, profile);
  assert.ok(next);
  const p1 = readPlayerKeys(next, 0);
  const p2 = readPlayerKeys(next, 1);
  assert.ok(
    p1.slice(0, 4).every((k) => k >= JOY_LIST_FIRST && k < JOY_LIST_FIRST + JOY_MAX_INPUTS),
    "P1 on joy port 0"
  );
  assert.ok(
    p2.slice(0, 4).every(
      (k) => k >= JOY_LIST_FIRST + JOY_MAX_INPUTS && k < JOY_LIST_FIRST + 2 * JOY_MAX_INPUTS
    ),
    "P2 on joy port 1"
  );
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
