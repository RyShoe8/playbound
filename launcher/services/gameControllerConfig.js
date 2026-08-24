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
const fs = require("fs");
const { defaultContext } = require("./saveLocations");

/**
 * The first of these paths that exists, or null.
 *
 * Several games can keep their config in more than one place depending on how
 * they were installed — portable beside the exe, or under the user profile.
 * Guessing wrong writes a file the game never reads, so an entry lists the
 * candidates and we take whichever one is actually there. Nothing existing
 * means the game has not written a config yet, and we do not invent one.
 */
function firstExisting(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // Unreadable is the same as absent for our purposes.
    }
  }
  return null;
}

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
 * Source engine (Half-Life 2 branch) — GoldenEye: Source.
 *
 * Documented on Valve's own wiki as shared across every Source game: `joystick`
 * turns the pad on, `joy_advanced "0"` keeps the two-stick auto mapping instead
 * of requiring per-axis assignment, and binds use the same JOY1..JOYn naming
 * the idTech games above inherited from the same Quake-derived console. Unlike
 * idTech's `seta cvar "1"`, Source cvars are set bare — there is no `seta`
 * command here, so this cannot reuse consoleConfigEntry().
 *
 * `invprev`/`invnext` are baseline Half-Life 2 SDK commands present in every
 * Source mod's default bindings, not something specific to GoldenEye: Source,
 * which is why they are used here rather than a GE:S-specific weapon command
 * that was never found documented anywhere.
 */
function sourceEngineJoystickBlock(profile) {
  const joy = (i) => `JOY${i + 1}`;
  const b = profile.buttons;
  return [
    `joystick "1"`,
    `joy_advanced "0"`,
    `joy_forwardsensitivity "-1"`,
    `joy_sidesensitivity "1"`,
    `joy_pitchsensitivity "1"`,
    `joy_yawsensitivity "-2"`,
    `bind ${joy(b.fire)} "+attack"`,
    `bind ${joy(b.altFire)} "+attack2"`,
    `bind ${joy(b.leftShoulder)} "invprev"`,
    `bind ${joy(b.rightShoulder)} "invnext"`,
    `bind ${joy(b.menu)} "gameui_activate"`,
    `bind ${joy(b.pause)} "+showscores"`,
  ].join("\n");
}

/**
 * Rewrite the body of one INI section, leaving every other section untouched.
 *
 * `mutate` is handed the section's lines and returns the replacement. Returns
 * null when the section is not there, which the callers treat as "this is not
 * the file we expected" rather than as a reason to create it.
 */
function editIniSection(text, section, mutate) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `[${section}]`.toLowerCase());
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\[.+\]$/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  const body = mutate(lines.slice(start + 1, end));
  return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join("\n");
}

function iniKeyOf(line) {
  const m = /^\s*([^=\s]+)\s*=/.exec(line);
  return m ? m[1].toLowerCase() : null;
}

/**
 * GZDoom — Freedoom, and any other Doom IWAD we ship through the same port.
 *
 * The one case on the list where the engine's controller support is complete
 * but unusable out of the box: a pad is detected and nothing is bound to it,
 * so the player faces thirty keybinds before they can move. What is written is
 * a starting layout, not a preference — `use_joystick` in [GlobalSettings] and
 * the six bindings that make the game playable in [Doom.Bindings].
 *
 * Only bindings that are not already present are added, so a button the player
 * has already claimed keeps whatever they put on it.
 */
function gzDoomBindings(profile) {
  const joy = (i) => `Joy${i + 1}`;
  const b = profile.buttons;
  return [
    [joy(b.fire), "+attack"],
    [joy(b.altFire), "+use"],
    [joy(b.leftShoulder), "weapprev"],
    [joy(b.rightShoulder), "weapnext"],
    [joy(b.menu), "menu_main"],
    [joy(b.pause), "togglemap"],
  ];
}

const gzDoomEntry = {
  verified:
    "UNVERIFIED against a real install — use_joystick and the [Doom.Bindings] " +
    "section are GZDoom's documented ini layout, but no config has been read " +
    "here. Both guards below decline anything that is not already a GZDoom ini.",
  /**
   * GZDoom keeps its ini beside the exe only when a portable one was created;
   * otherwise it lives under the user profile, and which of the two locations
   * applies depends on the port's version.
   */
  resolve: (c) =>
    firstExisting([
      c.installDir && path.join(c.installDir, "gzdoom_portable.ini"),
      path.join(c.documents, "My Games", "GZDoom", "gzdoom.ini"),
      path.join(c.appData, "gzdoom", "gzdoom.ini"),
    ]),
  needsConfig(text) {
    return !/^\s*use_joystick\s*=\s*true\s*$/im.test(String(text || ""));
  },
  apply(text, profile) {
    const original = String(text ?? "");
    // A GZDoom ini always has this section. Anything without it is not one.
    if (!/^\[GlobalSettings\]$/m.test(original)) return null;

    const enabled = editIniSection(original, "GlobalSettings", (body) => [
      ...body.filter((l) => iniKeyOf(l) !== "use_joystick"),
      "use_joystick=true",
    ]);
    if (enabled == null) return null;

    /*
     * Bindings are optional. A config written before any IWAD was played has
     * no [Doom.Bindings] yet; turning the pad on is still worth doing, and the
     * engine writes its own binding section later.
     */
    const bound = editIniSection(enabled, "Doom.Bindings", (body) => {
      const taken = new Set(body.map(iniKeyOf).filter(Boolean));
      const additions = gzDoomBindings(profile)
        .filter(([key]) => !taken.has(key.toLowerCase()))
        .map(([key, action]) => `${key}=${action}`);
      return [...body, ...additions];
    });
    return `${(bound ?? enabled).replace(/\s*$/, "")}\n`;
  },
};

/**
 * Luanti (Minetest) — `minetest.conf`, one `key = value` per line.
 *
 * Joystick support is present but off, so this is a handful of settings rather
 * than a binding list: the engine derives movement and look from the sticks
 * once `enable_joysticks` is on and it knows the pad's layout.
 *
 * `joystick_type` is the engine's own vocabulary, not ours — `auto` lets it
 * pick, and naming `xbox` when we know that is what is plugged in saves it
 * guessing wrong on a pad that reports an unhelpful id.
 */
const LUANTI_KEYS = [
  "enable_joysticks",
  "joystick_id",
  "joystick_type",
  "joystick_deadzone",
  "joystick_frustum_sensitivity",
  "repeat_joystick_button_time",
];

function luantiJoystickBlock(profile) {
  return [
    "enable_joysticks = true",
    "joystick_id = 0",
    `joystick_type = ${profile.family === "xbox" ? "xbox" : "auto"}`,
    "joystick_deadzone = 2048",
    "joystick_frustum_sensitivity = 170",
    "repeat_joystick_button_time = 0.17",
  ].join("\n");
}

const luantiEntry = {
  verified:
    "UNVERIFIED against a real install — setting names are Luanti's documented " +
    "joystick settings. The format guard declines anything that is not already " +
    "a key = value config.",
  /**
   * The win64 zip is portable and writes beside the exe. The two profile paths
   * cover an install that was run from elsewhere, and the rename from Minetest
   * to Luanti, which changed the directory but not the file name.
   */
  resolve: (c) =>
    firstExisting([
      c.installDir && path.join(c.installDir, "minetest.conf"),
      path.join(c.appData, "Luanti", "minetest.conf"),
      path.join(c.appData, "Minetest", "minetest.conf"),
    ]),
  needsConfig(text) {
    return !/^\s*enable_joysticks\s*=\s*true\s*$/im.test(String(text || ""));
  },
  apply(text, profile) {
    const original = String(text ?? "");
    // At least one real setting line, or this is not a minetest.conf.
    if (!/^\s*[A-Za-z_][\w.]*\s*=/m.test(original)) return null;
    /*
     * Drop our own keys before appending rather than appending blindly. Luanti
     * takes the last value for a repeated key, so duplicates would work — but
     * they leave a config that reads as though two things disagree.
     */
    const cleaned = original
      .split(/\r?\n/)
      .filter((line) => {
        const m = /^\s*([A-Za-z_][\w.]*)\s*=/.exec(line);
        return !m || !LUANTI_KEYS.includes(m[1]);
      })
      .join("\n")
      .replace(/\s*$/, "");
    return `${cleaned}\n\n# PlayBound controller setup\n${luantiJoystickBlock(profile)}\n`;
  },
};

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
  freedoom: gzDoomEntry,
  luanti: luantiEntry,
  "goldeneye-source": {
    /** Relative to the install directory — the mod's own sourcemods/gesource folder. */
    file: path.join("cfg", "config.cfg"),
    verified:
      "UNVERIFIED against a real install — joystick/joy_advanced/bind are Valve's " +
      "documented Source engine console commands, shared by every Source game, but no " +
      "GoldenEye: Source install has been read here. The guard below only writes into a " +
      "file that already looks like a real Source config.cfg, or an empty one on first run.",
    needsConfig(text) {
      return !/^\s*joystick\s+"?1"?\s*$/im.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      /*
       * config.cfg does not exist until the engine has run once and exited —
       * an empty read is the normal first-run case, not an unrecognised file.
       * Once it exists, the engine's own dump always opens with `unbindall`,
       * which is the signature checked for anything non-empty.
       */
      if (original.trim() !== "" && !/^unbindall\s*$/im.test(original)) return null;
      const block = sourceEngineJoystickBlock(profile);
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
    },
  },
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

/**
 * Games that take a pad as-is, and why no writer exists for them.
 *
 * Recorded rather than left out, because silence here is indistinguishable
 * from an oversight: the next person to ask "what about SuperTuxKart?" should
 * find the answer instead of assuming it was missed.
 *
 * The distinction that matters is `native` versus `unwritable`. A native game
 * binds a pad itself on first sight, so writing one would replace working
 * defaults with our guesses — strictly worse. An unwritable game would benefit
 * from a profile but keeps its settings somewhere we cannot safely edit.
 */
const NO_CONFIG_NEEDED = {
  gradius: {
    kind: "native",
    note: "The Godot project ships explicit joypad buttons and axes for movement, fire, upgrades, start and select.",
  },
  "apex-legends": { kind: "native", note: "Ships Xbox and PlayStation controller layouts." },
  "among-us": { kind: "native", note: "Native controller navigation and gameplay bindings." },
  "goose-goose-duck": { kind: "native", note: "Steam build ships full Xbox controller support." },
  trackmania: { kind: "native", note: "Native analog steering, acceleration and menu navigation." },
  "fishing-planet": { kind: "native", note: "Native Xbox and PlayStation controller support." },
  "sky-children-of-the-light": {
    kind: "native",
    note: "Steam build ships full Xbox and PlayStation controller support.",
  },
  bombsquad: {
    kind: "native",
    note: "Designed for multiple local game controllers; BombSquad Remote is also supported by the game.",
  },
  wolfenstein: {
    kind: "native",
    note: "ECWolf exposes modern control binding through SDL and keeps the player's own mapping.",
  },
  ysoccer: {
    kind: "native",
    note: "libGDX controller discovery supplies the connected pad; the PlayBound online build keeps its one-button layout.",
  },
  supertux: { kind: "native", note: "SDL2 binds a pad on detection; defaults cover the whole game." },
  supertuxkart: { kind: "native", note: "Detects pads on first run and writes its own mapping." },
  veloren: { kind: "native", note: "Analog movement, camera and combat are bound by default." },
  "shattered-pixel-dungeon": { kind: "native", note: "Ships D-pad navigation and action-bar mapping." },
  "endless-sky": { kind: "native", note: "Gamepad bindings are exposed in the game's own settings." },
  mindustry: {
    kind: "unwritable",
    note: "Settings live in a binary settings.bin, which we will not rewrite.",
  },
  "mega-man-unlimited": {
    kind: "unwritable",
    note: "GameMaker fan game with no text config to edit.",
  },
};

function supportsControllerConfig(gameSlug) {
  return Boolean(GAMES[gameSlug]);
}

/**
 * What the launcher can do for a game's controller support.
 *
 * One call so a caller has a single branch rather than checking two maps and
 * inferring the third case from both being empty.
 */
function controllerSupportFor(gameSlug) {
  if (GAMES[gameSlug]) {
    return { kind: "config", verified: GAMES[gameSlug].verified };
  }
  const known = NO_CONFIG_NEEDED[gameSlug];
  if (known) return { ...known };
  return { kind: "unknown", note: "Not assessed." };
}

/**
 * Where the config lives, given the install directory.
 *
 * Returns null rather than guessing when the install location is unknown —
 * writing a config into the wrong folder is worse than not writing one.
 */
function configPathFor(gameSlug, installDir, ctx = defaultContext()) {
  const entry = GAMES[gameSlug];
  if (!entry) return null;
  /*
   * An entry either sits at a fixed place inside the install — the case for
   * the portable engines — or has to look, because the config may be under the
   * user profile instead. The looking kind returns null when nothing is there,
   * which is correct: the game has not written a config for us to amend.
   */
  if (entry.resolve) {
    try {
      return entry.resolve({ ...ctx, installDir }) || null;
    } catch {
      return null;
    }
  }
  if (!installDir) return null;
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
  NO_CONFIG_NEEDED,
  supportsControllerConfig,
  controllerSupportFor,
  configPathFor,
  applyProfile,
  openTyrianJoystickBlock,
  luantiJoystickBlock,
  gzDoomBindings,
  editIniSection,
};
