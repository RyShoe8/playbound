const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveGogShadowWarriorLaunch } = require("./gogShadowWarrior");

test("GOG DOSBox launch includes the game's configs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-shadow-"));
  try {
    fs.mkdirSync(path.join(root, "DOSBOX"));
    const binary = path.join(root, "DOSBOX", "DOSBox.exe");
    fs.writeFileSync(binary, "");
    fs.writeFileSync(path.join(root, "dosbox_swarrior_settings.conf"), "");
    fs.writeFileSync(path.join(root, "dosbox_swarrior_single.conf"), "");
    fs.writeFileSync(path.join(root, "dosbox_swarrior.conf"), "");
    const launch = resolveGogShadowWarriorLaunch(path.join(root, "SW.exe"));
    assert.equal(launch.binary, binary);
    assert.deepEqual(launch.args, [
      "-conf", path.join(root, "dosbox_swarrior.conf"),
      "-conf", path.join(root, "dosbox_swarrior_single.conf"),
      "-noconsole", "-c", "exit",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
