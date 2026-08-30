/**
 * Controller auto-configuration.
 *
 * The risk here is not failing to configure a pad — it is overwriting settings
 * someone chose, or writing a file the game then cannot read. Most of what
 * follows checks that it declines to act.
 */
const assert = require("assert");
const { pickPrimary, familyFor, defaultProfile } = require("./controllerProfiles");
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
  assert.strictEqual(controllerSupportFor("no-such-game").kind, "unknown");
  // Roleplay / point-and-click — do not offer the PlayBound controller modal.
  assert.strictEqual(controllerSupportFor("space-station-14").kind, "unsupported");
  assert.strictEqual(supportsControllerConfig("space-station-14"), false);
  // Edition Play must still resolve when the UI briefly passes an edition slug.
  for (const slug of ["re-volt-rvgl", "rvgl-original", "rvgl-online", "rvgl"]) {
    assert.strictEqual(controllerSupportFor(slug).kind, "native", slug);
  }
});

/* ── locating a config that is not in the install directory ────────────── */

test("finds no config rather than inventing one somewhere wrong", () => {
  const nowhere = { home: NOWHERE, appData: NOWHERE, documents: NOWHERE, localAppData: NOWHERE };
  assert.strictEqual(configPathFor("luanti", NOWHERE, nowhere), null);
  assert.strictEqual(configPathFor("freedoom", NOWHERE, nowhere), null);
  // The fixed-location entries still resolve without looking at the disk.
  assert.ok(String(configPathFor("openarena", "C:\\Games\\OpenArena")).endsWith("q3config.cfg"));
});

test("prefers the portable config beside the exe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-controller-"));
  fs.writeFileSync(path.join(dir, "minetest.conf"), MINETEST_CONF);
  const ctx = { home: NOWHERE, appData: NOWHERE, documents: NOWHERE, localAppData: NOWHERE };
  assert.strictEqual(configPathFor("luanti", dir, ctx), path.join(dir, "minetest.conf"));
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ── flightsticks & hotas profiles ─────────────────────────────────────── */

test("detects flightstick and HOTAS hardware", () => {
  const thrustmaster = pickPrimary([{ id: "T.16000M Joystick (Vendor: 044f Product: b10a)", connected: true }]);
  assert.strictEqual(thrustmaster.isFlightstick, true);
  assert.strictEqual(thrustmaster.family, "thrustmaster-hotas");

  const logitechFlight = pickPrimary([{ id: "Logitech Extreme 3D Pro USB", connected: true }]);
  assert.strictEqual(logitechFlight.isFlightstick, true);
  assert.strictEqual(logitechFlight.family, "logitech-flight");

  const vkb = pickPrimary([{ id: "VKBsim Gladiator EVO R", connected: true }]);
  assert.strictEqual(vkb.isFlightstick, true);
  assert.strictEqual(vkb.family, "vkb-flight");
});

test("auto-configures Naev with joystick/flightstick block", () => {
  const t16k = pickPrimary([{ id: "T.16000M Joystick", connected: true }]);
  const naevConf = "-- Naev default config\nname = 'Pilot'\n";
  const out = applyProfile("naev", naevConf, t16k);
  assert.ok(out.includes("enable = true"));
  assert.ok(out.includes("Thrustmaster HOTAS"));
});

test("auto-configures Trigger Rally with joystick block", () => {
  const t16k = pickPrimary([{ id: "T.16000M Joystick", connected: true }]);
  const xml = "<trigger>\n <audio volume='1.0' />\n</trigger>";
  const out = applyProfile("trigger-rally", xml, t16k);
  assert.ok(out.includes("<joystick enable=\"yes\""));
  assert.ok(out.includes("<axis name=\"steer\""));
});

test("auto-configures Privateer Gemini Gold with joystick block", () => {
  const t16k = pickPrimary([{ id: "T.16000M Joystick", connected: true }]);
  const conf = "# Privateer Gemini Gold config\n[general]\nfullscreen=true\n";
  const out = applyProfile("privateer-gemini-gold", conf, t16k);
  assert.ok(out.includes("joy_enabled = true"));
  assert.ok(out.includes("Thrustmaster HOTAS"));
});

/* ── FlightGear: fgfsrc, and the file it must not touch ────────────────── */

const stick = pickPrimary([{ id: "Thrustmaster T.16000M Joystick", connected: true }]);

/** A real fgfsrc: command-line options, one per line, with comments. */
const FGFSRC = ["# FlightGear options", "--aircraft=c172p", "--airport=KSFO", ""].join("\n");

test("enables the first stick in an fgfsrc", () => {
  const out = applyProfile("flightgear", FGFSRC, stick);
  assert.ok(/^--prop:\/input\/joysticks\/js\[0\]\/enabled=true$/m.test(out), "stick enabled");
  assert.ok(out.includes("--aircraft=c172p"), "existing options survive");
});

test("leaves a real stick's own axis layout alone", () => {
  /*
   * FlightGear ships a binding profile for most sticks and binds a recognised
   * one on sight. Writing axis bindings over that makes things worse, so the
   * pad-only line is exactly that.
   */
  const withStick = applyProfile("flightgear", FGFSRC, stick);
  assert.ok(!withStick.includes("axis[0]/binding"), "no invented axis map for a stick");

  const withPad = applyProfile("flightgear", FGFSRC, dualsense);
  assert.ok(withPad.includes("axis[0]/binding"), "a pad still gets one");
});

test("refuses a file that is not an fgfsrc", () => {
  /*
   * The bug this replaced: the entry pointed at an autosave XML and appended
   * --prop: lines to it with no format check. Appending command-line syntax to
   * an XML document destroys the player's saved settings.
   */
  const autosaveXml = '<?xml version="1.0"?>\n<PropertyList>\n <sim n="0"><startup/></sim>\n</PropertyList>\n';
  assert.strictEqual(applyProfile("flightgear", autosaveXml, stick), null);
  assert.strictEqual(applyProfile("flightgear", "[Controls]\nx=1", stick), null);
});

test("FlightGear is idempotent", () => {
  const once = applyProfile("flightgear", FGFSRC, stick);
  assert.strictEqual(applyProfile("flightgear", once, stick), null);
});

/* ── OpenMW ────────────────────────────────────────────────────────────── */

const OPENMW = ["[Camera]", "field of view = 60", "", "[Input]", "grab cursor = true", ""].join("\n");

test("turns OpenMW's controller support on", () => {
  const out = applyProfile("morrowind", OPENMW, dualsense);
  assert.ok(/^enable controller = true$/m.test(out));
  assert.ok(out.includes("grab cursor = true"), "other input settings survive");
  assert.ok(out.includes("field of view = 60"), "other sections survive");
});

test("adds an [Input] section when the config has none", () => {
  const noInput = "[Camera]\nfield of view = 60\n";
  const out = applyProfile("morrowind", noInput, dualsense);
  assert.ok(out.includes("[Input]"));
  assert.ok(/^enable controller = true$/m.test(out));
});

test("does not hand OpenMW a pad dead zone for a flightstick", () => {
  // OpenMW has no flightstick layout; enabling it is the honest half.
  const out = applyProfile("morrowind", OPENMW, stick);
  assert.ok(/^enable controller = true$/m.test(out));
  assert.ok(!out.includes("joystick dead zone"));
});

test("OpenMW declines a foreign file and is idempotent", () => {
  assert.strictEqual(applyProfile("morrowind", "", dualsense), null);
  assert.strictEqual(applyProfile("morrowind", "just prose", dualsense), null);
  const once = applyProfile("morrowind", OPENMW, dualsense);
  assert.strictEqual(applyProfile("morrowind", once, dualsense), null);
});

/* ── Daggerfall Unity ──────────────────────────────────────────────────── */

const DFU = ["[Video]", "Fullscreen = True", "", "[Controls]", "MouseLookSensitivity = 2.0", ""].join("\n");

test("enables the pad in Daggerfall Unity", () => {
  const out = applyProfile("daggerfall", DFU, dualsense);
  assert.ok(/^EnableController = True$/m.test(out));
  assert.ok(out.includes("MouseLookSensitivity = 2.0"), "existing controls survive");
  assert.ok(out.includes("[Video]"), "other sections survive");
});

test("softens Daggerfall look sensitivity for a stick", () => {
  const pad = applyProfile("daggerfall", DFU, dualsense);
  const flight = applyProfile("daggerfall", DFU, stick);
  assert.ok(pad.includes("JoystickLookSensitivity = 1.0"));
  assert.ok(flight.includes("JoystickLookSensitivity = 0.6"));
});

test("Daggerfall declines a foreign file and is idempotent", () => {
  assert.strictEqual(applyProfile("daggerfall", "", dualsense), null);
  assert.strictEqual(applyProfile("daggerfall", "[Video]\nFullscreen = True", dualsense), null);
  const once = applyProfile("daggerfall", DFU, dualsense);
  assert.strictEqual(applyProfile("daggerfall", once, dualsense), null);
});

test("auto-configures YSoccer with libGDX JoystickConfig XML", () => {
  const emptyXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">\n<properties>\n<entry key="zoom">100</entry>\n</properties>\n`;
  const next = applyProfile("ysoccer", emptyXml, dualsense);
  assert(next.includes("joystickConfigs"));
  assert(next.includes("DualSense Wireless Controller"));
  /*
   * Axes 0 and 1, not 4 and 5.
   *
   * This assertion used to require xAxis:4, which is the trigger — so it was
   * pinning the bug in place: a DualSense could not move at all, and the test
   * agreed with the broken output. gdx-controllers talks to SDL on desktop,
   * and SDL reports every recognised pad the same way, left stick on 0 and 1.
   */
  const ds = next.match(/\{class:JoystickConfig,name:DualSense[^}]*\}/)[0];
  assert(/xAxis:0/.test(ds), `DualSense must use the left stick: ${ds}`);
  assert(/yAxis:1/.test(ds), `DualSense must use the left stick: ${ds}`);
});

test("treats a config bound to the triggers as needing a rewrite", () => {
  /*
   * The state a stuck player is actually in: the file names their pad, so every
   * other check says "configured", while movement points at an axis that is not
   * a stick. Taken from a real YSoccer19 prefs file.
   */
  const stuck =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<properties>\n` +
    `<entry key="joystickConfigs">[{class:JoystickConfig,name:DualSense Wireless Controller,xAxis:4,yAxis:3,button1:1,button2:2}]</entry>\n` +
    `</properties>\n`;
  const rewritten = applyProfile("ysoccer", stuck, dualsense);
  assert(rewritten, "a config on the triggers must be rewritten, not left alone");
  const ds = rewritten.match(/\{class:JoystickConfig,name:DualSense[^}]*\}/)[0];
  assert(/xAxis:0/.test(ds) && /yAxis:1/.test(ds), `still unusable: ${ds}`);
});

/* ── every catalogued controller game has an answer ────────────────────── */

test("no controller-capable game is left unassessed", () => {
  /*
   * The list the admin games table marks Yes for controller support. A game
   * missing from both maps is indistinguishable from one nobody looked at.
   */
  const yes = `morrowind wild-rift the-finals star-trek-online path-of-exile once-human palia
call-of-duty-mobile xonotic supertuxkart veloren endless-sky shattered-pixel-dungeon supertux
warframe mega-man-unlimited rainbow-six-siege where-winds-meet flightgear freedoom daggerfall
war-thunder team-fortress-2 genshin-impact valorant quake-champions holocure enlisted
asphalt-legends privateer-gemini-gold openlara strikers-club brawlhalla
mrboom trigger-rally ysoccer wolfenstein-enemy-territory dc-universe-online`
    .split(/\s+/)
    .filter(Boolean);

  const missing = yes.filter((slug) => controllerSupportFor(slug).kind === "unknown");
  assert.deepStrictEqual(missing, [], `unassessed: ${missing.join(", ")}`);
});


/*
 * Nothing plugged in still gets the offer.
 *
 * Games like YSoccer only detect a pad once their config names one, so the
 * config has to be writable before a controller is connected. That means the
 * writers have to cope with the stand-in profile, not just a real pad.
 */
test("builds a usable profile when no pad is connected", () => {
  const p = defaultProfile();
  assert.strictEqual(typeof p.family, "string");
  assert.ok(p.family, "family must be set - it keys the remembered answer");
  assert.strictEqual(p.label, "Gamepad");
  assert.ok(p.buttons && p.axes, "standard mapping must be present");
  // pickPrimary returns null with no pads; that is what triggers the default.
  assert.strictEqual(pickPrimary([]), null);
  assert.strictEqual(pickPrimary([{ connected: false, id: "" }]), null);
});

test("writes YSoccer joystick config from the no-pad profile", () => {
  const out = applyProfile("ysoccer", "", defaultProfile());
  assert.ok(out, "a fresh config must be produced without a controller attached");
  assert.ok(/joystickConfigs/.test(out), "must contain the libGDX joystick block");
  // The known controller names are what let YSoccer see a pad later.
  assert.ok(/GC101/.test(out) && /Xbox/.test(out), "must seed known controller names");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
