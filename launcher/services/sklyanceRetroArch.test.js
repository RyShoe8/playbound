const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareSklyanceRetroArch } = require("./sklyanceRetroArch");

test("Sky Lance uses its packaged open BIOS and sets Geolith to MVS without losing other options", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sklyance-test-"));
  try {
    const game = path.join(root, "game");
    const runtime = path.join(root, "runtime");
    const opt = path.join(runtime, "sklyance-config", "Geolith", "Geolith.opt");
    fs.mkdirSync(game);
    fs.mkdirSync(path.dirname(opt), { recursive: true });
    fs.writeFileSync(path.join(game, "neogeo.zip"), "EagleBIOS fixture");
    fs.writeFileSync(opt, 'geolith_system_type = "aes"\ngeolith_region = "us"\ngeolith_aspect = "1:1"\n');
    const args = await prepareSklyanceRetroArch(runtime, game);
    assert.deepEqual(args.slice(0, 1), ["--appendconfig"]);
    assert.match(fs.readFileSync(args[1], "utf8"), /system_directory = /);
    assert.match(fs.readFileSync(args[1], "utf8"), /rgui_config_directory = /);
    const options = fs.readFileSync(opt, "utf8");
    assert.match(options, /geolith_system_type = "mvs"/);
    assert.match(options, /geolith_region = "eu"/);
    assert.match(options, /geolith_aspect = "1:1"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Sky Lance refuses to launch without its bundled EagleBIOS", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sklyance-test-"));
  try {
    await assert.rejects(
      prepareSklyanceRetroArch(root, root),
      /EagleBIOS.*missing/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
