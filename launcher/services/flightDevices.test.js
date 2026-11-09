"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fd = require("./flightDevices");

test("reads vendor and product from Chrome and Firefox Gamepad ids and from SDL GUIDs", () => {
  assert.equal(fd.vidPidFromGamepadId("T.Flight Hotas 4 (Vendor: 044f Product: b67c)"), "044f:b67c");
  assert.equal(fd.vidPidFromGamepadId("044f-b67c-T.Flight Hotas 4"), "044f:b67c");
  assert.equal(fd.vidPidFromGamepadId("Xbox 360 Controller (XInput STANDARD GAMEPAD)"), null);
  assert.equal(fd.vidPidFromSdlGuid("03006FCE4F0400007CB6000000000000"), "044f:b67c");
  assert.equal(fd.vidPidFromSdlGuid("030000005E0400008E02000000000000"), "045e:028e");
  assert.equal(fd.vidPidFromSdlGuid("not-a-guid"), null);
});

test("a measured device resolves to its profile, anything else to the generic flight stick", () => {
  assert.equal(fd.resolveFlightProfile("044f:b67c").id, "tflight-hotas-4");
  assert.equal(fd.resolveFlightProfile("1234:5678").id, "generic-flightstick");
  assert.equal(fd.resolveFlightProfile(null).generic, true);
});

test("every profile is internally consistent", () => {
  for (const p of [...fd.PROFILES, fd.GENERIC_FLIGHTSTICK]) {
    for (const [role, name] of Object.entries(p.roles)) {
      assert.ok(Number.isInteger(p.buttons[name]), `${p.id}: role ${role} names unknown button ${name}`);
    }
    for (const axis of Object.values(p.axes)) assert.ok(axis >= 0 && axis < fd.AXIS_NAMES.length, `${p.id}: axis ${axis}`);
    for (const axis of p.unusableAxes) assert.ok(!Object.values(p.axes).includes(axis), `${p.id}: unusable axis ${axis} is bound`);
    const hat = Object.values(p.hat);
    assert.deepEqual([...hat].sort(), [...fd.HAT_DIRECTIONS].sort(), `${p.id}: hat must report each direction once`);
  }
});

test("roles and the hat resolve to physical inputs", () => {
  const hotas = fd.profileForVidPid("044f:b67c");
  assert.equal(fd.buttonForRole(hotas, "fire"), 0);
  assert.equal(fd.buttonForRole(hotas, "pause"), 11);
  assert.equal(fd.buttonForRole(fd.GENERIC_FLIGHTSTICK, "pause"), null);
  // The HOTAS 4 reports a right push as SDL "left" (index 3).
  assert.equal(fd.hatIndexFor(hotas, "right"), 3);
  assert.equal(fd.hatIndexFor(fd.GENERIC_FLIGHTSTICK, "right"), 1);
});

test("controller detection carries the flight layout for sticks and leaves pads alone", () => {
  const { profileFromGamepad } = require("./controllerProfiles");
  const hotas = profileFromGamepad({ id: "T.Flight Hotas 4 (Vendor: 044f Product: b67c)", mapping: "" });
  assert.equal(hotas.deviceType, "flightstick");
  assert.equal(hotas.flight.id, "tflight-hotas-4");
  const stick = profileFromGamepad({ id: "Logitech Extreme 3D (Vendor: 046d Product: c215)", mapping: "" });
  assert.equal(stick.flight.id, "generic-flightstick");
  const pad = profileFromGamepad({ id: "Xbox 360 Controller (XInput STANDARD GAMEPAD)", mapping: "standard" });
  assert.equal(pad.deviceType, "gamepad");
  assert.equal(pad.flight, null);
});

test("every flight adapter can both apply at launch and configure on request", () => {
  const { ADAPTERS } = require("./flightAdapters");
  for (const [slug, adapter] of Object.entries(ADAPTERS)) {
    assert.equal(typeof adapter.autoApply, "function", slug);
    assert.equal(typeof adapter.configure, "function", slug);
  }
});
