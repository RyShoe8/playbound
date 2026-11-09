"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { launchConfigText, prepareRetroArchLaunch } = require("./retroArchLaunchConfig");

test("every launch turns off config saving and states RetroArch's own folders", () => {
  const text = launchConfigText({ appDir: "C:/RA", core: "gambatte" });
  assert.match(text, /config_save_on_exit = "false"/);
  assert.match(text, /system_directory = "C:\/RA\/system"/);
  assert.match(text, /rgui_config_directory = "C:\/RA\/config"/);
  assert.doesNotMatch(text, /core_options_path/);
});

test("an Amiga launch reads PlayBound's PUAE options, which choose the built-in AROS Kickstart", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-ra-"));
  try {
    const binary = path.join(root, "current", "RetroArch-Win64", "retroarch.exe");
    const value = await prepareRetroArchLaunch({ root, binary, core: "puae" });
    const launch = await fs.readFile(value, "utf8");
    assert.match(launch, /global_core_options = "true"/);
    const optionsPath = launch.match(/core_options_path = "([^"]+)"/)[1];
    assert.match(await fs.readFile(optionsPath, "utf8"), /puae_kickstart = "aros"/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a game's own appendconfig is joined after ours so it keeps priority", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-ra-"));
  try {
    const value = await prepareRetroArchLaunch({ root, binary: path.join(root, "retroarch.exe"), core: "geolith", extra: "C:/x/sklyance.cfg" });
    assert.ok(value.endsWith("|C:/x/sklyance.cfg"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
