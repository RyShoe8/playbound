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

const GAMES = {
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
