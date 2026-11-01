"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFsoJoysticks, withFsoJoysticks } = require("./fsoHotas");

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
