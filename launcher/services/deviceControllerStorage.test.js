const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  hasDeviceConfig,
  saveDeviceConfig,
  restoreDeviceConfig,
  recordActiveDevice,
  getActiveDevice,
  onGameExited,
} = require("./deviceControllerStorage");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed += 1;
  }
}

async function run() {
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dev-storage-test-"));
  const tmpGameDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dev-game-test-"));

  try {
    await test("reports false when no device config exists yet", () => {
      assert.strictEqual(hasDeviceConfig(tmpUserData, "opentyrian", "xbox"), false);
      assert.strictEqual(hasDeviceConfig(tmpUserData, "opentyrian", "phone"), false);
    });

    await test("saves and restores text config file for a specific device", async () => {
      const configPath = path.join(tmpGameDir, "opentyrian.cfg");
      const xboxConfig = "section 'joystick' 'Xbox Controller'\n list 'fire' 'BTN 1'\n";
      fs.writeFileSync(configPath, xboxConfig, "utf8");

      const saved = await saveDeviceConfig(tmpUserData, "opentyrian", "xbox", configPath);
      assert.strictEqual(saved, true);
      assert.strictEqual(hasDeviceConfig(tmpUserData, "opentyrian", "xbox"), true);

      // Mutate the game config (simulating user changing it or another device)
      fs.writeFileSync(configPath, "section 'joystick' 'Different Pad'\n", "utf8");

      // Restore xbox config
      const restored = await restoreDeviceConfig(tmpUserData, "opentyrian", "xbox", configPath);
      assert.strictEqual(restored, true);
      assert.strictEqual(fs.readFileSync(configPath, "utf8"), xboxConfig);
    });

    await test("saves and restores binary config file", async () => {
      const binPath = path.join(tmpGameDir, "save.cfg");
      const binaryData = Buffer.from([0x00, 0x50, 0x31, 0xff, 0x12, 0x34]);
      fs.writeFileSync(binPath, binaryData);

      const saved = await saveDeviceConfig(tmpUserData, "tmnt", "dualsense", binPath, true);
      assert.strictEqual(saved, true);

      // Overwrite with different binary
      fs.writeFileSync(binPath, Buffer.from([0x00, 0x00, 0x00]));

      const restored = await restoreDeviceConfig(tmpUserData, "tmnt", "dualsense", binPath, true);
      assert.strictEqual(restored, true);
      assert.deepStrictEqual(fs.readFileSync(binPath), binaryData);
    });

    await test("preserves multiple device configs independently without clobbering", async () => {
      const configPath = path.join(tmpGameDir, "opentyrian_multi.cfg");
      const xboxConfig = "section 'joystick' 'Xbox Controller'\n list 'fire' 'BTN 1'\n";
      const phoneConfig = "section 'joystick' 'Phone Controller'\n list 'fire' 'BTN 2'\n";
      const keyboardConfig = "section 'keyboard'\n item 'fire' 'Space'\n";

      // Save Xbox
      fs.writeFileSync(configPath, xboxConfig, "utf8");
      await saveDeviceConfig(tmpUserData, "multi-test", "xbox", configPath);

      // Save Phone
      fs.writeFileSync(configPath, phoneConfig, "utf8");
      await saveDeviceConfig(tmpUserData, "multi-test", "phone", configPath);

      // Save Keyboard
      fs.writeFileSync(configPath, keyboardConfig, "utf8");
      await saveDeviceConfig(tmpUserData, "multi-test", "keyboard", configPath);

      // Restore and verify Phone
      await restoreDeviceConfig(tmpUserData, "multi-test", "phone", configPath);
      assert.strictEqual(fs.readFileSync(configPath, "utf8"), phoneConfig);

      // Restore and verify Xbox
      await restoreDeviceConfig(tmpUserData, "multi-test", "xbox", configPath);
      assert.strictEqual(fs.readFileSync(configPath, "utf8"), xboxConfig);

      // Restore and verify Keyboard
      await restoreDeviceConfig(tmpUserData, "multi-test", "keyboard", configPath);
      assert.strictEqual(fs.readFileSync(configPath, "utf8"), keyboardConfig);
    });

    await test("onGameExited snapshots changes the user made in-game", async () => {
      const configPath = path.join(tmpGameDir, "game_exit_test.cfg");
      const initialConfig = "section 'joystick' 'Xbox Controller'\n list 'fire' 'BTN 1'\n";
      fs.writeFileSync(configPath, initialConfig, "utf8");

      // Record active launch session for this game on xbox
      recordActiveDevice("exit-game", "xbox", configPath, false);
      assert.strictEqual(getActiveDevice("exit-game")?.deviceId, "xbox");

      // In-game, user rebound fire to BTN 4
      const userReboundConfig = "section 'joystick' 'Xbox Controller'\n list 'fire' 'BTN 4'\n";
      fs.writeFileSync(configPath, userReboundConfig, "utf8");

      // Game exits
      const exited = await onGameExited(tmpUserData, "exit-game");
      assert.strictEqual(exited, true);
      assert.strictEqual(getActiveDevice("exit-game"), null);

      // Wipe current file
      fs.writeFileSync(configPath, "EMPTY");

      // Restore on next game load
      await restoreDeviceConfig(tmpUserData, "exit-game", "xbox", configPath, false);
      assert.strictEqual(fs.readFileSync(configPath, "utf8"), userReboundConfig);
    });
  } finally {
    fs.rmSync(tmpUserData, { recursive: true, force: true });
    fs.rmSync(tmpGameDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
