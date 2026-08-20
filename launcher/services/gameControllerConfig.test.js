/**
 * Controller auto-configuration.
 *
 * The risk here is not failing to configure a pad — it is overwriting settings
 * someone chose, or writing a file the game then cannot read. Most of what
 * follows checks that it declines to act.
 */
const assert = require("assert");
const { pickPrimary, familyFor } = require("./controllerProfiles");
const { applyProfile, configPathFor, supportsControllerConfig } = require("./gameControllerConfig");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed += 1;
  }
}

const dualsense = pickPrimary([
  { id: "Sony DualSense Wireless Controller (Vendor: 054c Product: 0ce6)", mapping: "standard", connected: true },
]);

/** A real opentyrian.cfg with no joystick section — a fresh install. */
const FRESH = [
  "section 'video'",
  " item 'fullscreen' '1'",
  " item 'scaler' 'Scale3x'",
  "",
  "section 'keyboard'",
  " item 'up' 'Up'",
  " item 'fire' 'Space'",
  "",
].join("\n");

/* ── detection ─────────────────────────────────────────────────────────── */

test("names a DualSense the way the game expects", () => {
  assert.strictEqual(dualsense.label, "PS5 Controller");
});

test("recognises the pads people own", () => {
  assert.strictEqual(familyFor("Xbox Wireless Controller").label, "Xbox Controller");
  assert.strictEqual(familyFor("Wireless Controller (DualShock 4)").label, "PS4 Controller");
});

test("falls back to a working profile for an unknown pad", () => {
  // Better a standard layout than nothing bound at all.
  const p = pickPrimary([{ id: "Some Off-Brand Pad", mapping: "standard", connected: true }]);
  assert.strictEqual(p.label, "Gamepad");
  assert.strictEqual(typeof p.buttons.fire, "number");
});

test("ignores the empty slots the Gamepad API reports", () => {
  assert.strictEqual(pickPrimary([null, undefined, { id: "", connected: false }]), null);
  assert.strictEqual(pickPrimary([]), null);
});

/* ── writing ───────────────────────────────────────────────────────────── */

test("adds a joystick section to a fresh config", () => {
  const out = applyProfile("opentyrian", FRESH, dualsense);
  assert.ok(out.includes("section 'joystick' 'PS5 Controller'"));
  assert.ok(out.includes("list 'fire' 'BTN 1'"), "fire is button 0, written 1-indexed");
  assert.ok(out.includes("list 'up' 'AX 2-'"), "vertical axis is axis 1, written 1-indexed");
});

test("keeps everything already in the file", () => {
  const out = applyProfile("opentyrian", FRESH, dualsense);
  assert.ok(out.includes("item 'fullscreen' '1'"));
  assert.ok(out.includes("item 'fire' 'Space'"), "keyboard bindings survive");
});

/* ── declining to act ──────────────────────────────────────────────────── */

test("never touches a config that already has a joystick section", () => {
  // The player configured their pad. That decision outranks ours.
  const configured = `${FRESH}\nsection 'joystick' 'Xbox Controller'\n list 'fire' 'BTN 3'\n`;
  assert.strictEqual(applyProfile("opentyrian", configured, dualsense), null);
});

test("declines a file it does not recognise", () => {
  // Wrong file, or a format change upstream — leave it alone.
  assert.strictEqual(applyProfile("opentyrian", "<html>not a config</html>", dualsense), null);
});

test("declines when no pad is connected", () => {
  assert.strictEqual(applyProfile("opentyrian", FRESH, null), null);
});

test("declines for a game with no entry", () => {
  assert.strictEqual(applyProfile("some-other-game", FRESH, dualsense), null);
  assert.strictEqual(supportsControllerConfig("some-other-game"), false);
});

test("will not guess a path without an install directory", () => {
  assert.strictEqual(configPathFor("opentyrian", null), null);
  assert.ok(String(configPathFor("opentyrian", "C:/games/x")).endsWith("opentyrian.cfg"));
});

/* ── round trip ────────────────────────────────────────────────────────── */

test("its own output is treated as already configured", () => {
  /*
   * The property that stops it rewriting on every launch: feed the result
   * back in and it must decline.
   */
  const once = applyProfile("opentyrian", FRESH, dualsense);
  assert.strictEqual(applyProfile("opentyrian", once, dualsense), null);
});

/* ── console-config engines ────────────────────────────────────────────── */

/** A real q3config, shortened. The engine rewrites this file wholesale. */
const Q3 = [
  "unbindall",
  'bind TAB "+scores"',
  'bind SPACE "+moveup"',
  'seta in_joystickThreshold "0.15"',
  'seta in_joystick "0"',
  'seta name "Player"',
].join("\n");

test("enables the pad in an ioquake3 config", () => {
  const out = applyProfile("openarena", Q3, dualsense);
  assert.ok(out.includes('seta in_joystick "1"'));
  assert.ok(out.includes('bind JOY1 "+attack"'), "fire is button 0, written JOY1");
});

test("removes the disabled flag rather than leaving both", () => {
  // The engine reads the last value set, so a stale "0" could win.
  const out = applyProfile("openarena", Q3, dualsense);
  assert.ok(!out.includes('seta in_joystick "0"'));
});

test("keeps every other setting in the config", () => {
  const out = applyProfile("openarena", Q3, dualsense);
  assert.ok(out.includes('bind TAB "+scores"'));
  assert.ok(out.includes('seta name "Player"'));
});

test("leaves it alone when the player already enabled a pad", () => {
  const on = Q3.replace('seta in_joystick "0"', 'seta in_joystick "1"');
  assert.strictEqual(applyProfile("openarena", on, dualsense), null);
});

test("declines an empty or unfamiliar console config", () => {
  // Writing only our lines would drop everything else the engine had.
  assert.strictEqual(applyProfile("openarena", "", dualsense), null);
  assert.strictEqual(applyProfile("openarena", "garbage", dualsense), null);
});

test("Xonotic gets DarkPlaces cvars, not ioquake3 ones", () => {
  /*
   * The correction that matters. Treating these as one "Quake family" would
   * have written in_joystick into an engine that ignores it — the games are
   * related, their config vocabularies are not.
   */
  const dp = ['seta joy_enable "0"', 'bind SPACE "+jump"'].join("\n");
  const out = applyProfile("xonotic", dp, dualsense);
  assert.ok(out.includes('seta joy_enable "1"'));
  assert.ok(!out.includes("in_joystick"), "DarkPlaces has no such cvar");
});

test("console entries are idempotent too", () => {
  const once = applyProfile("openarena", Q3, dualsense);
  assert.strictEqual(applyProfile("openarena", once, dualsense), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
