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

test("configures a default pilot, preserves custom presets and keeps the first backup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-fso-test-"));
  try {
    const table = path.join(root, "kn_portable/Library/FotG_R/v1/FG_Core/data/tables/Controlconfigdefaults.tbl");
    const settings = path.join(root, "user/fs2_open.ini");
    const players = path.join(root, "user/data/players");
    await fs.mkdir(path.dirname(table), { recursive: true });
    await fs.mkdir(players, { recursive: true });
    await fs.writeFile(table, "#ControlConfigOverride\n$Name: default\n#End\n");
    const pilot = JSON.stringify({ version: 4, sections: { controls: { preset: "default" }, scoring: { score: 42 } } });
    await fs.writeFile(path.join(players, "Ace.json"), pilot);
    const custom = JSON.stringify({ sections: { controls: { preset: "My custom setup" } } });
    await fs.writeFile(path.join(players, "Custom.json"), custom);
    const devices = [{ name: "T.Flight Hotas 4" }];
    assert.equal((await configureFotgHotas4(root, settings, devices)).activated, 1);
    await configureFotgHotas4(root, settings, devices);
    const saved = JSON.parse(await fs.readFile(path.join(players, "Ace.json"), "utf8"));
    assert.equal(saved.sections.controls.preset, "PlayBound TFlight HOTAS 4");
    assert.equal(saved.sections.scoring.score, 42);
    assert.equal(await fs.readFile(path.join(players, "Ace.json.playbound-hotas4.bak"), "utf8"), pilot);
    assert.equal(await fs.readFile(path.join(players, "Custom.json"), "utf8"), custom);
    assert.equal((await configureFotgHotas4(root, settings, [{ name: "Other" }])).throttleConfigured, false);
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
