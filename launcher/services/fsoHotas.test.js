"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFsoJoysticks, withFsoJoysticks } = require("./fsoHotas");
const { withHotas4Preset, configureFotgHotas4 } = require("./fsoHotas");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

test("HOTAS flight preset covers twelve distinct buttons and an alternate rocker axis", () => {
  const { HOTAS4_BUTTONS } = require("./fsoHotas");
  assert.equal(new Set(HOTAS4_BUTTONS.map((item) => item[1])).size, 12);
  assert.equal(new Set(HOTAS4_BUTTONS.map((item) => item[2])).size, 12);
  const result = withHotas4Preset("#ControlConfigOverride\n$Name: default\n#End\n", 0);
  assert.match(result, /JOY_BANK_AXIS[\s\S]*?\$Secondary:\n\$Controller: CID_JOY0\n\$Flags: CCF_AXIS\n\$Input: U_AXIS/);
  assert.match(result, /TARGET_CLOSEST_SHIP_ATTACKING_SELF\n\$Secondary:\n\$Controller: CID_NONE/);
  assert.doesNotMatch(result, /\$Bind: (AFTERBURNER|LAUNCH_COUNTERMEASURE)/);
});

test("HOTAS 4 uses its measured Z axis without replacing game defaults", () => {
  const original = "#ControlConfigOverride\n$Name: default\n#End\n";
  const result = withHotas4Preset(original, 0);
  assert.ok(result.startsWith(original));
  assert.match(result, /JOY_ABS_THROTTLE_AXIS[\s\S]*CID_JOY0[\s\S]*CCF_AXIS[\s\S]*Z_AXIS/);
  assert.match(result, /JOY_BANK_AXIS\n\$Primary:\n\$Controller: CID_JOY0\n\$Flags: CCF_AXIS\n\$Input: RZ_AXIS/);
  assert.doesNotMatch(result, /\$Input: RX_AXIS/);
  for (const action of ["JOY_HEADING_AXIS", "JOY_PITCH_AXIS", "JOY_BANK_AXIS", "JOY_ABS_THROTTLE_AXIS"]) {
    assert.equal(result.split(`$Bind: ${action}\n`).length - 1, 1);
  }
  assert.equal(withHotas4Preset(result, 0), result);
  assert.match(withHotas4Preset(result, 1), /CID_JOY1/);
  assert.throws(() => withHotas4Preset(original, 4));
});

const ORDER = require("./fsoActionOrder");
const pilotWith = (preset) => ({
  version: 4,
  sections: {
    controls: {
      preset,
      // FSO's stock pad: fire on 0, the hat look on 128–131 (left/right reversed
      // for the HOTAS 4), bank on RX (3) — the slot that rolled on its own.
      controls: ORDER.slice(0, 124).map((bind) => ({
        key: 20,
        joystick: { FIRE_PRIMARY: 0, TARGET_CLOSEST_SHIP_ATTACKING_SELF: 2, PADLOCK_LEFT: 131, PADLOCK_RIGHT: 129 }[bind] ?? -1,
        mouse: -1,
      })),
      axes: [0, 1, 3, -1, -1].map((axis_map) => ({ axis_map, invert_axis: 0 })),
    },
    scoring: { score: 42 },
  },
});
const joyOf = (pilot, bind) => pilot.sections.controls.controls[ORDER.indexOf(bind)].joystick;

test("writes the HOTAS 4 bindings into the pilot itself, keeping keys and the first backup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-fso-test-"));
  try {
    const table = path.join(root, "kn_portable/Library/FotG_R/v1/FG_Core/data/tables/Controlconfigdefaults.tbl");
    const settings = path.join(root, "user/fs2_open.ini");
    const players = path.join(root, "user/data/players");
    await fs.mkdir(path.dirname(table), { recursive: true });
    await fs.mkdir(players, { recursive: true });
    await fs.writeFile(table, "#ControlConfigOverride\n$Name: default\n#End\n");
    const pilot = JSON.stringify(pilotWith("default"));
    await fs.writeFile(path.join(players, "Ace.json"), pilot);
    const devices = [{ name: "T.Flight Hotas 4" }];
    assert.equal((await configureFotgHotas4(root, settings, devices)).activated, 1);
    await configureFotgHotas4(root, settings, devices);
    const saved = JSON.parse(await fs.readFile(path.join(players, "Ace.json"), "utf8"));
    const c = saved.sections.controls;
    assert.equal(c.preset, "PlayBound TFlight HOTAS 4");
    // The bindings themselves, not just the label.
    assert.deepEqual(c.axes.map((a) => a.axis_map), [0, 1, 5, 2, -1]);
    assert.equal(joyOf(saved, "FIRE_SECONDARY"), 1);
    assert.equal(joyOf(saved, "PADLOCK_LEFT"), 129);
    assert.equal(joyOf(saved, "PADLOCK_RIGHT"), 131);
    assert.equal(joyOf(saved, "TARGET_CLOSEST_SHIP_ATTACKING_SELF"), -1);
    assert.ok(c.controls.every((b) => b.key === 20));
    assert.equal(saved.sections.scoring.score, 42);
    assert.equal(await fs.readFile(path.join(players, "Ace.json.playbound-hotas4.bak"), "utf8"), pilot);
    assert.match(await fs.readFile(table, "utf8"), /PADLOCK_LEFT\n\$Secondary:\n\$Controller: CID_JOY0\n\$Flags: NONE\n\$Input: 129/);
    // An unmeasured stick still gets throttle, roll and fire from the generic layout.
    const generic = await configureFotgHotas4(root, settings, [{ name: "Some Flight Stick" }]);
    assert.equal(generic.throttleConfigured, true);
    assert.equal(generic.measured, false);
    assert.equal(generic.preset, "PlayBound Flight stick");
    const regeneric = JSON.parse(await fs.readFile(path.join(players, "Ace.json"), "utf8"));
    assert.deepEqual(regeneric.sections.controls.axes.map((a) => a.axis_map), [0, 1, 5, 2, -1]);
    assert.equal(joyOf(regeneric, "PADLOCK_RIGHT"), 129);
    assert.equal((await configureFotgHotas4(root, settings, [])).throttleConfigured, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("at launch, a HOTAS 4 on Joy0 is set up automatically but a player's own preset is left alone", async () => {
  const { autoApplyFotgDevicePresets } = require("./fsoHotas");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-fso-auto-"));
  try {
    const table = path.join(root, "kn_portable/Library/FotG_R/FotG_R-1.1.2/data/tables/Controlconfigdefaults.tbl");
    const settings = path.join(root, "user/fs2_open.ini");
    const players = path.join(root, "user/data/players");
    await fs.mkdir(path.dirname(table), { recursive: true });
    await fs.mkdir(players, { recursive: true });
    await fs.writeFile(table, "#ControlConfigOverride\n$Name: default\n#End\n");
    await fs.writeFile(path.join(players, "Ace.json"), JSON.stringify(pilotWith("default")));
    const custom = JSON.stringify(pilotWith("My custom setup"));
    await fs.writeFile(path.join(players, "Custom.json"), custom);

    await fs.writeFile(settings, "[Default]\nJoy0GUID=030000005E0400008E02000000000000\n");
    assert.equal((await autoApplyFotgDevicePresets(root, settings)).applied, false);

    await fs.writeFile(settings, "[Default]\nJoy0ID=0\nJoy0GUID=03006FCE4F0400007CB6000000000000\n");
    const result = await autoApplyFotgDevicePresets(root, settings);
    assert.equal(result.applied, true);
    assert.equal(result.activated, 1);
    assert.equal(await fs.readFile(path.join(players, "Custom.json"), "utf8"), custom);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("reads separate stick and throttle IDs from FSO flags", () => {
  const devices = parseFsoJoysticks(JSON.stringify({ joysticks: [
    { name: "Flight Stick", id: 1, guid: "03006FCE4F0400007CB6000000000000" },
    { name: "Throttle", id: 2, guid: "03006FCE4F0400007CB6000000000001" },
    { name: "Invalid", id: -1, guid: "bad" },
  ] }));
  assert.deepEqual(devices.map((item) => item.id), [1, 2]);
});

test("sets FSO Joy0 and Joy1 while preserving unrelated settings and sections", () => {
  const input = "[Default]\r\nLastPlayer=Ace\r\nJoy0ID=9\r\nJoy0GUID=OLD\r\n[Video]\r\nWidth=1920\r\n";
  const output = withFsoJoysticks(input, [
    { id: 1, guid: "AAA" }, { id: 2, guid: "BBB" },
  ]);
  assert.match(output, /LastPlayer=Ace\r\nJoy0ID=1\r\nJoy0GUID=AAA\r\nJoy1ID=2\r\nJoy1GUID=BBB\r\n\[Video\]/);
  assert.doesNotMatch(output, /Joy0ID=9|Joy0GUID=OLD/);
  assert.match(output, /Width=1920/);
});

test("finds the control defaults in the 1.1 layout, without FG_Core", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fotg-11-"));
  try {
    const table = path.join(root, "kn_portable/Library/FotG_R/FotG_R-1.1.2/data/tables/Controlconfigdefaults.tbl");
    await fs.mkdir(path.dirname(table), { recursive: true });
    await fs.writeFile(table, "#ControlConfigOverride\n$Name: default\n#End\n");
    const settings = path.join(root, "settings", "fs2_open.ini");
    const result = await configureFotgHotas4(root, settings, [{ name: "T.Flight Hotas 4" }]);
    assert.equal(result.throttleConfigured, true);
    assert.match(await fs.readFile(table, "utf8"), /PlayBound TFlight HOTAS 4/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
