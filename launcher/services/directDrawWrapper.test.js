const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  writeDgVoodooConf,
  findMsX86Dir,
  needsDirectDrawWrapper,
  isFreeTrainSlug,
  CLSID_DIRECTDRAW,
} = require("./directDrawWrapper");

test("FreeTrain slug detection", () => {
  assert.equal(isFreeTrainSlug("freetrain"), true);
  assert.equal(isFreeTrainSlug("free-train"), true);
  assert.equal(isFreeTrainSlug("hurry-curry"), false);
  assert.equal(needsDirectDrawWrapper({ needsDirectDrawWrapper: true }, "other"), true);
  assert.equal(needsDirectDrawWrapper({}, "freetrain"), true);
});

test("writeDgVoodooConf writes OutputAPI", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dd-"));
  writeDgVoodooConf(dir);
  const body = fs.readFileSync(path.join(dir, "dgVoodoo.conf"), "utf8");
  assert.match(body, /OutputAPI\s*=\s*d3d11/);
  assert.match(body, /dgVoodooWatermark\s*=\s*false/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findMsX86Dir locates MS/x86 with DDraw.dll", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dgv-"));
  const ms = path.join(root, "MS", "x86");
  fs.mkdirSync(ms, { recursive: true });
  fs.writeFileSync(path.join(ms, "DDraw.dll"), "x");
  assert.equal(findMsX86Dir(root), ms);
  fs.rmSync(root, { recursive: true, force: true });
});

test("CLSID_DIRECTDRAW is the classic DirectDraw class", () => {
  assert.equal(CLSID_DIRECTDRAW, "{E1211353-8E94-11D1-8808-00C04FC2C602}");
});
