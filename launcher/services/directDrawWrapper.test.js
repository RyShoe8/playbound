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
  DIRECTDRAW_COM_CLSIDS,
  ensureDdrawFilenamePair,
  looksLikeAvBlock,
  AV_BLOCK_MSG,
  dirHasMsX86Dlls,
  createDirectDrawWrapper,
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

test("findMsX86Dir accepts flat MS/x86-only extract root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dgv-flat-"));
  fs.writeFileSync(path.join(root, "DDraw.dll"), "x");
  assert.equal(findMsX86Dir(root), root);
  fs.rmSync(root, { recursive: true, force: true });
});

test("CLSID_DIRECTDRAW is the classic DirectDraw class", () => {
  assert.equal(CLSID_DIRECTDRAW, "{E1211353-8E94-11D1-8808-00C04FC2C602}");
});

test("COM redirection covers FreeTrain and DDrawCompat CLSIDs", () => {
  assert.ok(DIRECTDRAW_COM_CLSIDS.includes(CLSID_DIRECTDRAW));
  assert.ok(DIRECTDRAW_COM_CLSIDS.some((c) => c.startsWith("{D7B70EE0")));
});

test("ensureDdrawFilenamePair mirrors DDraw.dll to ddraw.dll", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dd-pair-"));
  fs.writeFileSync(path.join(dir, "DDraw.dll"), "x");
  const resolved = ensureDdrawFilenamePair(dir);
  assert.equal(resolved, path.join(dir, "ddraw.dll"));
  assert.ok(fs.existsSync(path.join(dir, "ddraw.dll")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("looksLikeAvBlock detects Defender wording", () => {
  assert.equal(looksLikeAvBlock("Operation did not complete successfully because the file contains a virus", ""), true);
  assert.equal(looksLikeAvBlock("Expand-Archive failed", ""), false);
  assert.match(AV_BLOCK_MSG, /Defender/i);
});

test("ensureForGame copies from a local MS/x86 source without GitHub", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dd-ud-"));
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dd-game-"));
  const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dd-bundle-"));
  for (const name of ["DDraw.dll", "D3DImm.dll", "D3D8.dll", "D3D9.dll"]) {
    fs.writeFileSync(path.join(bundle, name), "dll");
  }

  // Point bundled lookup at our temp dir by temporarily writing beside services.
  const wrapper = createDirectDrawWrapper({
    userDataPath: userData,
    msX86MirrorUrl: "http://127.0.0.1:9/should-not-be-hit.zip",
  });

  // Seed game dir empty; monkey-patch by putting DLLs in game after resolve via game-dir path:
  // First call with DLLs already in gameDir.
  for (const name of ["DDraw.dll", "D3DImm.dll", "D3D8.dll", "D3D9.dll"]) {
    fs.copyFileSync(path.join(bundle, name), path.join(gameDir, name));
  }
  assert.equal(dirHasMsX86Dlls(gameDir), true);

  const result = await wrapper.ensureForGame(gameDir, {
    slug: "freetrain",
    skipComRegistration: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "game-dir");
  assert.ok(fs.existsSync(path.join(gameDir, "dgVoodoo.conf")));

  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(gameDir, { recursive: true, force: true });
  fs.rmSync(bundle, { recursive: true, force: true });
});
