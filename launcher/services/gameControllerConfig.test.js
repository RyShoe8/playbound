/**
 * Controller auto-configuration.
 *
 * The risk here is not failing to configure a pad — it is overwriting settings
 * someone chose, or writing a file the game then cannot read. Most of what
 * follows checks that it declines to act.
 */
const assert = require("assert");
const { pickPrimary, familyFor } = require("./controllerProfiles");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  applyProfile,
  configPathFor,
  supportsControllerConfig,
  controllerSupportFor,
} = require("./gameControllerConfig");

/** A directory that does not exist, so every candidate lookup misses. */
const NOWHERE = path.join(os.tmpdir(), "pb-no-such-dir-4f2a");

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

test("records native controller support without overwriting game-owned bindings", () => {
  for (const slug of [
    "gradius",
    "apex-legends",
    "among-us",
    "goose-goose-duck",
    "trackmania",
    "fishing-planet",
    "sky-children-of-the-light",
    "bombsquad",
    "wolfenstein",
  ]) {
    assert.strictEqual(controllerSupportFor(slug).kind, "native", slug);
    assert.strictEqual(supportsControllerConfig(slug), false, `${slug} should keep its native bindings`);
  }
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

/* ── Source engine (GoldenEye: Source) ─────────────────────────────────── */

/** A real Source config.cfg dump, shortened. The engine rewrites this wholesale. */
const SOURCE_CFG = [
  "unbindall",
  'bind "w" "+forward"',
  'bind "TAB" "+showscores"',
  'joystick "0"',
  'name "Player"',
].join("\n");

test("enables the pad in a Source engine config", () => {
  const out = applyProfile("goldeneye-source", SOURCE_CFG, dualsense);
  assert.ok(out.includes('joystick "1"'));
  assert.ok(out.includes('bind JOY1 "+attack"'), "fire is button 0, written JOY1");
  // Source has no `seta` command — every other engine's cvar-set prefix must not leak in.
  assert.ok(!out.includes("seta "), "Source cvars are set bare, not with seta");
});

test("keeps every other setting in the Source config", () => {
  const out = applyProfile("goldeneye-source", SOURCE_CFG, dualsense);
  assert.ok(out.includes('bind "w" "+forward"'));
  assert.ok(out.includes('name "Player"'));
});

test("leaves it alone when the player already enabled a pad", () => {
  const on = SOURCE_CFG.replace('joystick "0"', 'joystick "1"');
  assert.strictEqual(applyProfile("goldeneye-source", on, dualsense), null);
});

test("writes into an empty config.cfg — the normal first-run case", () => {
  const out = applyProfile("goldeneye-source", "", dualsense);
  assert.ok(out.includes('joystick "1"'));
});

test("declines an unfamiliar file", () => {
  assert.strictEqual(applyProfile("goldeneye-source", "<html>not a config</html>", dualsense), null);
});

test("Source config is idempotent too", () => {
  const once = applyProfile("goldeneye-source", SOURCE_CFG, dualsense);
  assert.strictEqual(applyProfile("goldeneye-source", once, dualsense), null);
});

/* ── GZDoom / Freedoom ─────────────────────────────────────────────────── */

/** A gzdoom.ini shaped like the engine writes it, with a pad detected and nothing bound. */
const GZDOOM = [
  "# This file was generated by GZDoom",
  "",
  "[GlobalSettings]",
  "vid_defwidth=1280",
  "use_joystick=false",
  "snd_mididevice=-5",
  "",
  "[Doom.Bindings]",
  "1=slot 1",
  "Space=+use",
  "",
  "[Doom.AutomapBindings]",
  "F=am_gobig",
  "",
].join("\n");

test("turns the pad on and binds the essentials for GZDoom", () => {
  const out = applyProfile("freedoom", GZDOOM, dualsense);
  assert.ok(/^use_joystick=true$/m.test(out), "joystick enabled");
  assert.ok(!/use_joystick=false/.test(out), "the disabled flag is gone, not merely shadowed");
  assert.ok(/^Joy1=\+attack$/m.test(out), "fire bound");
  assert.ok(/^Joy10=menu_main$/m.test(out), "start opens the menu");
});

test("writes GZDoom bindings into the bindings section, not the settings one", () => {
  const out = applyProfile("freedoom", GZDOOM, dualsense);
  const settings = out.slice(out.indexOf("[GlobalSettings]"), out.indexOf("[Doom.Bindings]"));
  assert.ok(!settings.includes("Joy1="), "a binding in [GlobalSettings] would be ignored");
  const bindings = out.slice(out.indexOf("[Doom.Bindings]"), out.indexOf("[Doom.AutomapBindings]"));
  assert.ok(bindings.includes("Joy1=+attack"));
  // Sections after the ones we touch have to survive intact.
  assert.ok(out.includes("[Doom.AutomapBindings]\nF=am_gobig"));
});

test("keeps a button the player already claimed", () => {
  const mine = GZDOOM.replace("Space=+use", "Space=+use\nJoy1=+jump");
  const out = applyProfile("freedoom", mine, dualsense);
  assert.ok(out.includes("Joy1=+jump"), "their binding stands");
  assert.ok(!out.includes("Joy1=+attack"), "and is not duplicated with ours");
});

test("leaves a GZDoom config alone once the pad is on", () => {
  const on = applyProfile("freedoom", GZDOOM, dualsense);
  assert.strictEqual(applyProfile("freedoom", on, dualsense), null);
});

test("declines anything that is not a GZDoom ini", () => {
  assert.strictEqual(applyProfile("freedoom", "", dualsense), null);
  assert.strictEqual(applyProfile("freedoom", "[SomeOtherApp]\nx=1", dualsense), null);
});

/* ── Luanti ────────────────────────────────────────────────────────────── */

const MINETEST_CONF = [
  "# Minetest configuration file",
  "name = ry",
  "viewing_range = 120",
  "enable_joysticks = false",
  "sound_volume = 0.8",
  "",
].join("\n");

test("enables Luanti's joystick support without duplicating keys", () => {
  const out = applyProfile("luanti", MINETEST_CONF, dualsense);
  assert.ok(/^enable_joysticks = true$/m.test(out));
  assert.strictEqual(out.match(/^enable_joysticks/gm).length, 1, "one value, not two in disagreement");
  assert.ok(out.includes("name = ry"), "unrelated settings survive");
  assert.ok(out.includes("sound_volume = 0.8"));
});

test("names the pad type when it knows it", () => {
  const xbox = pickPrimary([{ id: "Xbox Wireless Controller", mapping: "standard", connected: true }]);
  assert.ok(applyProfile("luanti", MINETEST_CONF, xbox).includes("joystick_type = xbox"));
  // An unknown pad gets auto rather than a guess the engine would act on.
  assert.ok(applyProfile("luanti", MINETEST_CONF, dualsense).includes("joystick_type = auto"));
});

test("Luanti is idempotent and declines a foreign file", () => {
  const once = applyProfile("luanti", MINETEST_CONF, dualsense);
  assert.strictEqual(applyProfile("luanti", once, dualsense), null);
  assert.strictEqual(applyProfile("luanti", "", dualsense), null);
  assert.strictEqual(applyProfile("luanti", "just prose, no settings", dualsense), null);
});

/* ── the games we deliberately do not write ────────────────────────────── */

test("records why a native game has no writer", () => {
  // Left out silently, this is indistinguishable from having been forgotten.
  for (const slug of ["supertux", "supertuxkart", "veloren", "shattered-pixel-dungeon", "endless-sky"]) {
    assert.strictEqual(controllerSupportFor(slug).kind, "native", slug);
    assert.strictEqual(supportsControllerConfig(slug), false, `${slug} must not be written to`);
  }
  assert.strictEqual(controllerSupportFor("mindustry").kind, "unwritable");
  assert.strictEqual(controllerSupportFor("openarena").kind, "config");
  assert.strictEqual(controllerSupportFor("goldeneye-source").kind, "config");
  assert.strictEqual(controllerSupportFor("no-such-game").kind, "unknown");
});

/* ── locating a config that is not in the install directory ────────────── */

test("finds no config rather than inventing one somewhere wrong", () => {
  const nowhere = { home: NOWHERE, appData: NOWHERE, documents: NOWHERE, localAppData: NOWHERE };
  assert.strictEqual(configPathFor("luanti", NOWHERE, nowhere), null);
  assert.strictEqual(configPathFor("freedoom", NOWHERE, nowhere), null);
  // The fixed-location entries still resolve without looking at the disk.
  assert.ok(String(configPathFor("openarena", "C:\\Games\\OpenArena")).endsWith("q3config.cfg"));
  assert.ok(
    String(configPathFor("goldeneye-source", "C:\\Games\\gesource")).endsWith(
      path.join("cfg", "config.cfg")
    )
  );
});

test("prefers the portable config beside the exe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-controller-"));
  fs.writeFileSync(path.join(dir, "minetest.conf"), MINETEST_CONF);
  const ctx = { home: NOWHERE, appData: NOWHERE, documents: NOWHERE, localAppData: NOWHERE };
  assert.strictEqual(configPathFor("luanti", dir, ctx), path.join(dir, "minetest.conf"));
  fs.rmSync(dir, { recursive: true, force: true });
});


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
