/**
 * Writing a detected controller into each game's own config format.
 *
 * The registry that makes adding a game small. `controllerProfiles.js` decides
 * what pad is plugged in and describes it in one vocabulary; an entry here
 * translates that vocabulary into the file a particular game reads.
 *
 * Adding a game:
 *   1. Configure the pad by hand in-game once, and keep the config file.
 *   2. Find where it lives — often the same directory saveLocations.js names.
 *   3. Write an `apply(text, profile)` that returns the file with the bindings
 *      replaced, and leaves everything else alone.
 *   4. Add a case to the test file with a real before/after.
 *
 * Two rules every entry follows, because both are ways to lose a player's
 * settings rather than improve them:
 *
 *   Never clobber deliberate changes. `apply` runs when the game has no
 *   controller configured, not on every launch, so someone who rebound their
 *   pad keeps what they chose.
 *
 *   Never write a file you did not parse. If the format is not what was
 *   expected, return null and leave the original untouched.
 */

const path = require("path");

/**
 * OpenTyrian keeps `opentyrian.cfg` beside the executable — the same directory
 * saveLocations.js records for its save. The format is line-based:
 *
 *   section 'joystick' 'PS5 Controller'
 *    item 'analog' 'yes'
 *    list 'fire' 'BTN 2'
 *
 * Buttons are 1-indexed in the file and 0-indexed in the Gamepad API, hence
 * the +1 throughout. Axes are named `AX <n><sign>`, also 1-indexed.
 */
function openTyrianJoystickBlock(profile) {
  const btn = (i) => `BTN ${i + 1}`;
  const b = profile.buttons;
  const axX = profile.axes.x + 1;
  const axY = profile.axes.y + 1;

  const lines = [
    `section 'joystick' '${profile.label}'`,
    ` item 'analog' 'yes'`,
    ` item 'sensitivity' '5'`,
    ` item 'threshold' '5'`,
    ` list 'up' 'AX ${axY}-'`,
    ` list 'right' 'AX ${axX}+'`,
    ` list 'down' 'AX ${axY}+'`,
    ` list 'left' 'AX ${axX}-'`,
    ` list 'fire' '${btn(b.fire)}'`,
    ` list 'change fire' '${btn(b.altFire)}'`,
    ` list 'left sidekick' '${btn(b.leftShoulder)}'`,
    ` list 'right sidekick' '${btn(b.rightShoulder)}'`,
    ` list 'menu' '${btn(b.menu)}'`,
    ` list 'pause' '${btn(b.pause)}'`,
  ];
  return lines.join("\n");
}

/**
 * idTech 3 / ioquake3 — OpenArena, Unvanquished, Enemy Territory.
 *
 * Verified against a real OpenArena q3config.cfg, which carries
 * `seta in_joystick "0"` and `seta in_joystickThreshold`. Enabling a pad here
 * is a cvar flip plus the axis mapping; buttons bind as JOY1..JOYn, 1-indexed
 * against the Gamepad API's 0-indexed buttons.
 *
 * Deliberately additive. A q3config is rewritten wholesale by the engine on
 * exit, so appending our lines at the end lets the engine keep ownership of
 * the file and simply re-serialise what we set.
 */
function ioq3JoystickBlock(profile) {
  const joy = (i) => `JOY${i + 1}`;
  const b = profile.buttons;
  return [
    `seta in_joystick "1"`,
    `seta in_joystickThreshold "0.15"`,
    // Left stick: forward/back on the vertical axis, strafe on the horizontal.
    `seta j_forward "-0.25"`,
    `seta j_side "0.25"`,
    `seta j_up "0"`,
    `seta j_pitch "0.022"`,
    `seta j_yaw "-0.022"`,
    `bind ${joy(b.fire)} "+attack"`,
    `bind ${joy(b.altFire)} "+moveup"`,
    `bind ${joy(b.leftShoulder)} "weapprev"`,
    `bind ${joy(b.rightShoulder)} "weapnext"`,
    `bind ${joy(b.menu)} "togglemenu"`,
    `bind ${joy(b.pause)} "+scores"`,
  ].join("\n");
}

/**
 * DarkPlaces — Xonotic.
 *
 * A different engine with a different vocabulary: `joy_enable` rather than
 * `in_joystick`, and axis mapping through `joy_axis*` rather than `j_*`.
 * Grouping it with the ioquake3 games because they are all "Quake-ish" would
 * have written cvars this engine silently ignores.
 */
function darkPlacesJoystickBlock(profile) {
  const joy = (i) => `JOY${i + 1}`;
  const b = profile.buttons;
  return [
    `seta joy_enable "1"`,
    `seta joy_detected "1"`,
    `seta joy_axisforward "1"`,
    `seta joy_axisside "0"`,
    `seta joy_sensitivityyaw "-2.5"`,
    `seta joy_sensitivitypitch "2"`,
    `bind ${joy(b.fire)} "+attack"`,
    `bind ${joy(b.altFire)} "+jump"`,
    `bind ${joy(b.leftShoulder)} "weapprev"`,
    `bind ${joy(b.rightShoulder)} "weapnext"`,
    `bind ${joy(b.menu)} "togglemenu"`,
  ].join("\n");
}

/**
 * Shared entry builder for the console-config engines.
 *
 * `enabledCvar` is what "already configured" means for that engine — if the
 * player has turned a pad on themselves, we leave the file alone.
 */
function consoleConfigEntry({ file, verified, enabledCvar, block }) {
  return {
    file,
    verified,
    needsConfig(text) {
      const s = String(text || "");
      // Already on. Their setting, their call.
      return !new RegExp(`seta\\s+${enabledCvar}\\s+"1"`).test(s);
    },
    apply(text, profile) {
      const original = String(text ?? "");
      /*
       * Only a file that looks like a real console config. An empty or
       * unfamiliar file is left alone rather than replaced with just our
       * lines, which would drop every other setting the engine had.
       */
      if (!/^(seta|bind|unbindall)\b/m.test(original)) return null;
      // Drop any previous disabled flag so the engine does not read both.
      const cleaned = original
        .split(/\r?\n/)
        .filter((line) => !new RegExp(`^seta\\s+${enabledCvar}\\s+"0"`).test(line))
        .join("\n")
        .replace(/\s*$/, "");
      return `${cleaned}\n\n// PlayBound controller setup\n${block(profile)}\n`;
    },
  };
}

const GAMES = {
  openarena: consoleConfigEntry({
    file: path.join("baseoa", "q3config.cfg"),
    verified: "read from a real OpenArena install — seta in_joystick / in_joystickThreshold",
    enabledCvar: "in_joystick",
    block: ioq3JoystickBlock,
  }),
  unvanquished: consoleConfigEntry({
    file: path.join("config", "autogen.cfg"),
    verified:
      "UNVERIFIED — Daemon is an ioquake3 fork and should share in_joystick, " +
      "but no real config has been read. The format guard declines anything " +
      "that does not already look like a console config.",
    enabledCvar: "in_joystick",
    block: ioq3JoystickBlock,
  }),
  "wolfenstein-enemy-territory": consoleConfigEntry({
    file: path.join("etmain", "etconfig.cfg"),
    verified:
      "UNVERIFIED — id Tech 3 variant, expected to share in_joystick. No real " +
      "config read yet.",
    enabledCvar: "in_joystick",
    block: ioq3JoystickBlock,
  }),
  xonotic: consoleConfigEntry({
    file: path.join("data", "config.cfg"),
    verified:
      "UNVERIFIED — DarkPlaces, so joy_enable rather than in_joystick. Kept " +
      "separate from the ioquake3 games because their cvars do not apply here.",
    enabledCvar: "joy_enable",
    block: darkPlacesJoystickBlock,
  }),
  opentyrian: {
    /** Relative to the install directory. */
    file: "opentyrian.cfg",
    verified:
      "read from a real install after configuring a DualSense by hand — the " +
      "joystick section is keyed on the pad's display name",
    /**
     * True when the file has no joystick section at all. A section that is
     * already there was put there by the game, which means the player has
     * configured something and we leave it alone.
     */
    needsConfig(text) {
      return !/^section 'joystick'/m.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      // Only a file we recognise. Anything else is left untouched.
      if (!/^section 'video'/m.test(original) && original.trim() !== "") return null;
      const block = openTyrianJoystickBlock(profile);
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
    },
  },
};

function supportsControllerConfig(gameSlug) {
  return Boolean(GAMES[gameSlug]);
}

/**
 * Where the config lives, given the install directory.
 *
 * Returns null rather than guessing when the install location is unknown —
 * writing a config into the wrong folder is worse than not writing one.
 */
function configPathFor(gameSlug, installDir) {
  const entry = GAMES[gameSlug];
  if (!entry || !installDir) return null;
  return path.join(installDir, entry.file);
}

/**
 * The file's new contents, or null to leave it alone.
 *
 * Null covers every "do nothing" case on purpose — unknown game, already
 * configured, unrecognised format, no pad — so the caller has one branch
 * rather than four.
 */
function applyProfile(gameSlug, text, profile) {
  const entry = GAMES[gameSlug];
  if (!entry || !profile) return null;
  if (!entry.needsConfig(text)) return null;
  return entry.apply(text, profile);
}

module.exports = {
  GAMES,
  supportsControllerConfig,
  configPathFor,
  applyProfile,
  openTyrianJoystickBlock,
};
