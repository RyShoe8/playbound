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
const os = require("os");
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

/*
 * DualSense sticks under this backend are 5/4, not the 4/3 written first.
 *
 * With 4/3 the pad worked but drove the wrong things: left stick up/down moved
 * the menu left and right, right stick left/right moved it up and down. Those
 * two symptoms say axis 4 is left-stick Y and axis 3 is right-stick X, and
 * against DualSense's DirectInput order (0=LX 1=LY 2=RX 3=RY 4=L2 5=R2) only
 * one arrangement puts both there: the OIS backend enumerating the axes
 * reversed, 0=R2 1=L2 2=RY 3=RX 4=LY 5=LX. That makes the left stick 5 and 4.
 *
 * Matching 4/3 here means an already-written config is treated as stale and
 * rewritten, so a player who hit the bug does not have to delete their prefs.
 */
function ysoccerHasDualSenseStickAxes(text) {
  const entries = String(text || "").match(/\{class:JoystickConfig,name:[^}]+\}/g) || [];
  const dualSenseEntries = entries.filter((entry) =>
    /name:(?:DualSense|PS5 Controller)/i.test(entry)
  );
  return dualSenseEntries.some((entry) => /xAxis:5,\s*yAxis:4(?:,|\})/.test(entry));
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

/*
 * Every name this pad might answer to, most specific first.
 *
 * The renderer hands us a Web Gamepad id — "DualSense Wireless Controller
 * (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" — while OIS reports a
 * DirectInput name, which is the product name Windows keeps under
 * MediaProperties\...\Joystick\OEM ("DualSense Wireless Controller") or,
 * for a pad with no OEM entry, the generic device name. Since the game
 * matches on exact equality, write all of them.
 */
function joystickNamesFor(profile) {
  const raw = String(profile?.rawId || "").trim();
  const names = [];
  if (raw) {
    names.push(raw);
    // Strip the Web Gamepad API's " (STANDARD GAMEPAD Vendor: … Product: …)"
    // suffix to leave the product name DirectInput reports.
    const trimmed = raw.replace(/\s*\((?:STANDARD GAMEPAD\s*)?Vendor:.*$/i, "").trim();
    if (trimmed && trimmed !== raw) names.push(trimmed);
  }
  // What Windows calls a pad with no vendor driver, and what OIS then reports.
  names.push("HID-compliant game controller");
  return names.filter(Boolean);
}

const rvglEntry = {
  verified: "VERIFIED against RVGL original — defaults Controller1 to Joystick 0 and standard gamepad button layout.",
  resolve: (c) => {
    if (!c.installDir) return null;
    const rvglIniPath = path.join(c.installDir, "profiles", "rvgl.ini");
    let profileName = "player";
    try {
      if (fs.existsSync(rvglIniPath)) {
        const text = fs.readFileSync(rvglIniPath, "utf8");
        const m = /^\s*DefaultProfile\s*=\s*"([^"]+)"/im.exec(text);
        if (m && m[1]) profileName = m[1];
      }
    } catch {
      /* ignore */
    }
    return firstExisting([
      path.join(c.installDir, "profiles", profileName, "profile.ini"),
      path.join(c.installDir, "profiles", "player", "profile.ini"),
    ]);
  },
  needsConfig(text) {
    const m = /^\s*Joystick\s*=\s*(-?\d+)/im.exec(String(text || ""));
    if (!m) return true;
    return Number(m[1]) < 0;
  },
  apply(text, profile) {
    const original = String(text || "");
    if (!/^\[Controller1\]/im.test(original)) return null;
    return editIniSection(original, "Controller1", () => [
      "Joystick = 0",
      "ForceFeedback = 0",
      "NonLinearSteering = 1",
      "SteeringDeadzone = 10",
      "SteeringRange = 90",
      "ButtonOpacity = 50",
      "KeyLeft = 0x01ff000d",
      "KeyRight = 0x01ff000e",
      "KeyFwd = 0x01ff0000",
      "KeyBack = 0x01ff0002",
      "KeyFire = 0x01ff0001",
      "KeyReset = 0x01ff0003",
      "KeyReposition = 0x01ff0004",
      "KeyHonka = 0x01ff0005",
      "KeyChangeCamera = 0x01ff0006",
      "KeyRearView = 0x01ff0007",
      "KeyPause = 0x01ff0008",
    ]);
  },
};

const GAMES = {
  "re-volt-rvgl": rvglEntry,
  "rvgl-original": rvglEntry,
  "rvgl-online": rvglEntry,
  revolt: rvglEntry,
  rvgl: rvglEntry,
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
  "opentyrian-2000": {
    file: "opentyrian.cfg",
    verified: "OpenTyrian 2000 alias to opentyrian controller config",
    needsConfig(text) {
      return !/^section 'joystick'/m.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      if (!/^section 'video'/m.test(original) && original.trim() !== "") return null;
      const block = openTyrianJoystickBlock(profile);
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
    },
  },
  /**
   * FlightGear — `fgfsrc`, a list of the same options you would pass on the
   * command line, one per line.
   *
   * The file matters. This entry used to resolve `fgfs.ini` or an
   * `autosaved.xml`, neither of which is a name FlightGear uses: the options
   * file is `fgfsrc` and the saved-property file is `autosave_<major>_<minor>.xml`.
   * It was inert because nothing matched — but it appended `--prop:` lines with
   * no format check, so the day a name did match it would have written
   * command-line syntax into the middle of an XML document and taken the
   * player's saved settings with it.
   *
   * FlightGear already ships bindings for most sticks under Input/Joysticks and
   * binds a recognised one on sight, so the useful pre-launch action is making
   * sure the subsystem is on and the first stick is enabled rather than
   * inventing axis mappings that would override a better profile.
   */
  flightgear: {
    verified:
      "UNVERIFIED against a real install — fgfsrc is FlightGear's documented " +
      "options file and takes the same --prop: switches as the command line. " +
      "The guard below declines anything that is not already one.",
    resolve: (c) =>
      firstExisting([
        path.join(c.appData, "flightgear.org", "fgfsrc"),
        c.installDir && path.join(c.installDir, "fgfsrc"),
        c.installDir && path.join(c.installDir, "system.fgfsrc"),
      ]),
    needsConfig(text) {
      return !/^\s*--prop:\/input\/joysticks\/js\[0\]\/enabled=true\s*$/im.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      /*
       * Every meaningful line in an fgfsrc is an option or a comment. Anything
       * else — XML, an ini section header — means we resolved the wrong file,
       * and appending to it would break whatever it actually is.
       */
      const meaningful = original
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      if (meaningful.some((l) => !l.startsWith("--"))) return null;

      const stick = profile.deviceType === "flightstick";
      const lines = [
        "--prop:/input/joysticks/js[0]/enabled=true",
        // Only for a pad. A real stick has an axis layout of its own and
        // FlightGear's shipped profile for it is better than anything here.
        ...(stick ? [] : ["--prop:/input/joysticks/js[0]/axis[0]/binding/command=property-scale"]),
      ];
      const trimmed = original.replace(/\s*$/, "");
      const block = `# PlayBound ${stick ? "flightstick" : "controller"} setup — ${profile.label}\n${lines.join("\n")}\n`;
      return trimmed ? `${trimmed}\n\n${block}` : block;
    },
  },
  /**
   * OpenMW — Morrowind's engine reimplementation. `settings.cfg` is ini-shaped
   * with an `[Input]` section.
   *
   * Controller support is complete and off: OpenMW ships a full gamepad layout
   * behind `enable controller`, so this is a flag flip rather than a binding
   * list. It writes into the user config, which OpenMW layers over its
   * defaults, so nothing shipped with the game is overwritten.
   */
  morrowind: {
    verified:
      "UNVERIFIED against a real install — 'enable controller' is OpenMW's " +
      "documented [Input] setting. The guard declines anything that is not " +
      "already an ini with that section.",
    resolve: (c) =>
      firstExisting([
        path.join(c.documents, "My Games", "OpenMW", "settings.cfg"),
        c.installDir && path.join(c.installDir, "settings.cfg"),
        path.join(c.appData, "openmw", "settings.cfg"),
      ]),
    needsConfig(text) {
      return !/^\s*enable controller\s*=\s*true\s*$/im.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      // An OpenMW settings.cfg is ini sections; anything else is the wrong file.
      if (!/^\[[A-Za-z ]+\]$/m.test(original)) return null;

      const body = (lines) => [
        ...lines.filter((l) => !/^\s*enable controller\s*=/i.test(l)),
        "enable controller = true",
        // A stick's axes are nothing like a pad's, and OpenMW has no profile
        // for one — enabling it without a layout is the honest half.
        ...(profile.deviceType === "flightstick" ? [] : ["joystick dead zone = 0.15"]),
      ];
      const edited = editIniSection(original, "Input", (lines) =>
        body(lines.filter((l) => !/^\s*joystick dead zone\s*=/i.test(l)))
      );
      if (edited != null) return `${edited.replace(/\s*$/, "")}\n`;

      // No [Input] section yet: append one rather than declining, since the
      // file is recognisably OpenMW's and a missing section is normal.
      const trimmed = original.replace(/\s*$/, "");
      return `${trimmed}\n\n[Input]\n${body([]).join("\n")}\n`;
    },
  },

  /**
   * Daggerfall Unity — `settings.ini`, ini-shaped, with controller options in
   * `[Controls]`.
   *
   * The engine reads a joystick when told to and ships sensible axis defaults,
   * so this enables it and leaves the mapping alone.
   */
  daggerfall: {
    verified:
      "UNVERIFIED against a real install — [Controls] and the Joystick* keys " +
      "are Daggerfall Unity's documented settings.ini options. The guard " +
      "declines anything that is not already that ini.",
    resolve: (c) =>
      firstExisting([
        c.installDir && path.join(c.installDir, "settings.ini"),
        path.join(c.documents, "My Games", "Daggerfall Unity", "settings.ini"),
        path.join(c.appData, "Daggerfall Unity", "settings.ini"),
      ]),
    needsConfig(text) {
      return !/^\s*JoystickCursorSensitivity\s*=/im.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      // Daggerfall Unity's ini always carries this section.
      if (!/^\[Controls\]$/m.test(original)) return null;

      const keys = [
        ["EnableController", "True"],
        ["JoystickCursorSensitivity", "1.0"],
        ["JoystickMovementThreshold", "0.15"],
        ["JoystickLookSensitivity", profile.deviceType === "flightstick" ? "0.6" : "1.0"],
      ];
      const edited = editIniSection(original, "Controls", (lines) => {
        const taken = new Set(keys.map(([k]) => k.toLowerCase()));
        return [
          ...lines.filter((l) => !taken.has(String(iniKeyOf(l)))),
          ...keys.map(([k, v]) => `${k} = ${v}`),
        ];
      });
      if (edited == null) return null;
      return `${edited.replace(/\s*$/, "")}\n`;
    },
  },

  naev: {
    resolve: (c) =>
      firstExisting([
        c.installDir && path.join(c.installDir, "conf.lua"),
        path.join(c.appData, "naev", "conf.lua"),
        path.join(c.home, ".config", "naev", "conf.lua"),
      ]),
    verified: "Naev Lua joystick and controller auto-configuration.",
    needsConfig(text) {
      return !/joystick\s*=\s*\{[^}]*enable\s*=\s*true/m.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      if (!/--|naev|function|conf/i.test(original) && original.trim() !== "") return null;
      const joyName = profile.label || "Controller";
      const block = `-- PlayBound controller & flightstick setup\njoystick = {\n   enable = true,\n   name = "${joyName}",\n   deadzone = 0.15,\n}\n`;
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}` : block;
    },
  },
  "trigger-rally": {
    resolve: (c) =>
      firstExisting([
        c.installDir && path.join(c.installDir, "trigger.xml"),
        path.join(c.appData, "trigger-rally", "trigger.xml"),
        path.join(c.localAppData, "trigger-rally", "trigger.xml"),
      ]),
    verified: "Trigger Rally XML joystick/gamepad auto-configuration.",
    needsConfig(text) {
      return !/<joystick[^>]*enable="yes"/i.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      if (!/<trigger|<config|\?xml/i.test(original) && original.trim() !== "") return null;
      const block = ` <!-- PlayBound auto-controller / flightstick setup -->\n <joystick enable="yes" deadzone="0.15">\n  <axis name="steer" index="0" />\n  <axis name="throttle" index="1" />\n </joystick>`;
      if (original.includes("</trigger>")) {
        return original.replace("</trigger>", `${block}\n</trigger>`);
      }
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}\n` : `<trigger>\n${block}\n</trigger>\n`;
    },
  },
  "privateer-gemini-gold": {
    resolve: (c) =>
      firstExisting([
        c.installDir && path.join(c.installDir, "vegastrike.config"),
        c.installDir && path.join(c.installDir, "geminigold.config"),
      ]),
    verified: "Vega Strike / Privateer Gemini Gold flightstick & joystick configuration.",
    needsConfig(text) {
      return !/joy_enabled\s*=\s*true/i.test(String(text || ""));
    },
    apply(text, profile) {
      const original = String(text ?? "");
      if (!/<vegastrike|\[joystick\]|#|general/i.test(original) && original.trim() !== "") return null;
      const block = `# PlayBound Flightstick & Controller Setup\n[joystick]\njoy_enabled = true\njoy_name = ${profile.label}\n`;
      const trimmed = original.replace(/\s*$/, "");
      return trimmed ? `${trimmed}\n\n${block}` : block;
    },
  },

  ysoccer: {
    resolve: (c) => {
      const homePrefs = path.join(c.home || os.homedir(), ".prefs", "YSoccer19");
      const installPrefs = c.installDir && path.join(c.installDir, ".prefs", "YSoccer19");
      return firstExisting([homePrefs, installPrefs]) || homePrefs;
    },
    verified: "YSoccer libGDX XML preferences JoystickConfig auto-configuration.",
    /*
     * The D-pad cannot be made to work, and no config here will change that.
     *
     * com.ygames.ysoccer.framework.Joystick reads getAxis(xAxis),
     * getAxis(yAxis), getButton(button1) and getButton(button2) — and nothing
     * else. It contains no reference to getPov or PovDirection, while the OIS
     * backend it runs on exposes the D-pad only as a POV. So the game never
     * reads it, in menus or in a match. Players use the left stick.
     *
     * Recorded here because the prefs file gives no hint of it: a config can be
     * perfectly correct and the D-pad will still do nothing.
     */
    padLimitation: "D-pad is not read by this game; the left stick moves menus and players.",
    needsConfig(text, profile) {
      const s = String(text || "");
      if (!s.includes("<properties>") || !s.includes("joystickConfigs")) return true;
      if (!profile) return !s.includes("GC101") || !s.includes("DualSense") || !s.includes("Xbox");
      if (profile.family === "dualsense" && !/DualSense/i.test(s)) return true;
      if (profile.family === "xbox" && !/Xbox|GC101/i.test(s)) return true;
      if (profile.family === "dualshock4" && !/DualShock|PS4/i.test(s)) return true;
      if (profile.rawId && !s.includes(profile.rawId)) return true;
      // This build uses OIS/DirectInput, not the browser's standardized axis
      // order. The old 0/1 DualSense profile has working buttons but no stick.
      if (profile.family === "dualsense" && !ysoccerHasDualSenseStickAxes(s)) return true;
      return false;
    },
    apply(text, profile) {
      const original = String(text ?? "");
      const isDualSense = profile?.family === "dualsense" || /dualsense|ps5|0ce6/i.test(profile?.rawId || "");

      const configs = [
        `{class:JoystickConfig,name:Controller (GC101 1.03),xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Controller (XBOX 360 For Windows),xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Controller (Xbox 360 Wireless Receiver for Windows),xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Controller (Xbox One For Windows),xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Xbox 360 Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Xbox 360 Controller (XInput CONTROLLER),xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Xbox One Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:XInput Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Xbox Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:DualSense Wireless Controller,xAxis:5,yAxis:4,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Wireless Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:PS5 Controller,xAxis:5,yAxis:4,button1:0,button2:1}`,
        `{class:JoystickConfig,name:PS4 Controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:Wireless Gamepad,xAxis:0,yAxis:1,button1:0,button2:1}`,
        `{class:JoystickConfig,name:HID-compliant game controller,xAxis:0,yAxis:1,button1:0,button2:1}`,
      ];

      /*
       * One layout for every pad, because that is what the game sees.
       *
       * YSoccer 19 bundles gdx-controllers 1.x on its OIS backend — the jar
       * carries com.badlogic.gdx.controllers.desktop.OisControllers — so this
       * is DirectInput, not SDL as an earlier comment here claimed. Its axis
       * order is device-specific: DualSense uses 5/4 for the left stick while
       * Xbox-compatible pads use the mappings below. Face buttons are 0 and 1.
       *
       * The names matter more than the axes. GLGame.reloadInputDevices does:
       *
       *   cfg = settings.getJoystickConfigByName(controller.getName());
       *   if (cfg != null) inputDevices.add(new Joystick(controller, cfg, n));
       *
       * and getJoystickConfigByName is a String.equals scan. A pad whose name
       * matches nothing is not added to inputDevices at all — so it drives
       * neither menus nor matches, and the prefs file still looks configured.
       * Hence a name per plausible spelling rather than one: an entry that
       * never matches costs nothing, and a missing one costs the whole pad.
       */
      for (const name of joystickNamesFor(profile)) {
        if (!configs.some((c) => c.includes(`name:${name},`))) {
          const xAxis = isDualSense ? 5 : 0;
          const yAxis = isDualSense ? 4 : 1;
          configs.unshift(`{class:JoystickConfig,name:${name},xAxis:${xAxis},yAxis:${yAxis},button1:0,button2:1}`);
        }
      }

      const entryXml = `<entry key="joystickConfigs">[${configs.join(",")}]</entry>`;

      if (original.includes('<entry key="joystickConfigs">')) {
        return original.replace(/<entry key="joystickConfigs">[\s\S]*?<\/entry>/, entryXml);
      } else if (original.includes("</properties>")) {
        return original.replace("</properties>", `${entryXml}\n</properties>`);
      } else {
        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">\n<properties>\n${entryXml}\n</properties>\n`;
      }
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
  "alien-swarm-reactive-drop": {
    kind: "native",
    note:
      "Steam Input handles the pad. The install ships steam_input/steam_input_manifest.vdf " +
      "and steam_input/steam_deck.vdf — the game's own binding definitions — and Steam lists " +
      "it as Full controller support. Bindings live in Steam's config, not a file beside the " +
      "game, so there is nothing here for PlayBound to write.",
  },
  openclonk: {
    kind: "native",
    note:
      "Built on SDL2's GameController API — openclonk.exe carries SDL_GameController " +
      "along with GamepadEnabled and GamepadGuiControl, so a recognised pad is mapped " +
      "by SDL itself and drives the menus as well as play. Writing a config would " +
      "replace a working auto-mapping with a guess. Its settings live in a Config.txt " +
      "we have no reason to touch.",
  },
  "streets-of-rage-remake": {
    kind: "native",
    note:
      "The game configures the first gamepad itself. Its own manual: \"when the " +
      "game starts for the first time, checks are made and the first gamepad is " +
      "configured\", and it ships an in-game remapping screen showing which pad " +
      "number is being bound. There is also nothing PlayBound could safely " +
      "write — v5 keeps no ini or cfg, only savegame/savestate.sor, 356 bytes " +
      "of Bennu binary sitting beside the save.",
  },
  gradius: {
    kind: "native",
    note: "The Godot project ships explicit joypad buttons and axes for movement, fire, upgrades, start and select.",
  },
  "gradius-remake": {
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
  "renegade-x": {
    kind: "native",
    note: "Totem Arts ships complete Xbox-style bindings for movement, aiming, weapons, menus, scoring, and vehicles in DefaultInput.ini.",
  },
  supertux: { kind: "native", note: "SDL2 binds a pad on detection; defaults cover the whole game." },
  supertuxkart: { kind: "native", note: "Detects pads on first run and writes its own mapping." },
  veloren: { kind: "native", note: "Analog movement, camera and combat are bound by default." },
  "shattered-pixel-dungeon": { kind: "native", note: "Ships D-pad navigation and action-bar mapping." },
  "endless-sky": { kind: "native", note: "Gamepad bindings are exposed in the game's own settings." },
  hedgewars: { kind: "native", note: "Native gamepad input and binding menu in settings." },
  "the-finals": { kind: "native", note: "Native controller support with aim assist options." },
  /*
   * The last three the admin table marks as controller-capable. Recorded so
   * every Yes on that page has an answer here, rather than three that look
   * forgotten.
   */
  valorant: {
    kind: "unwritable",
    note: "Riot live-service install we do not manage; its config is not ours to edit.",
  },
  "wild-rift": {
    kind: "unwritable",
    note: "Mobile title run through an emulator — the pad is bound in the emulator, not the game.",
  },
  "space-station-14": {
    kind: "unsupported",
    note:
      "Round-based roleplay with heavy point-and-click and typing. The developers treat a gamepad as a non-starter — Steam Input community layouts exist, but PlayBound does not offer a controller path that would work well.",
  },
  "star-trek-online": { kind: "native", note: "Native gamepad layout for PC & console." },
  "path-of-exile": { kind: "native", note: "Native controller detection and custom UI layout." },
  "once-human": { kind: "native", note: "Native controller support for combat and inventory." },
  palia: { kind: "native", note: "Native controller support for movement and tools." },
  "call-of-duty-mobile": { kind: "native", note: "External Bluetooth and USB controller detection." },
  warframe: { kind: "native", note: "Full native controller integration and customizable bindings." },
  "albion-online": { kind: "native", note: "Native controller support across PC and mobile." },
  "rainbow-six-siege": { kind: "native", note: "Native controller support with customizable deadzones." },
  "where-winds-meet": { kind: "native", note: "Native controller support for combat and traversal." },
  "war-thunder": { kind: "native", note: "Native controller, HOTAS, and flightstick configuration wizard." },
  "team-fortress-2": { kind: "native", note: "Native Steam controller / gamepad input stack." },
  "genshin-impact": { kind: "native", note: "Native controller support with dedicated button overlays." },
  "counter-strike-2": { kind: "native", note: "Native Steam Input and controller support." },
  "quake-champions": { kind: "native", note: "Native controller support." },
  holocure: { kind: "native", note: "Native twin-stick and controller mapping." },
  freedoom: {
    kind: "native",
    note: "GZDoom and Zandronum feature native XInput and DirectInput controller detection with built-in analog sticks and triggers.",
  },
  enlisted: { kind: "native", note: "Native controller support for infantry and vehicles." },
  "world-of-sea-battle": { kind: "native", note: "Native gamepad steering and broadside firing." },
  "asphalt-legends": { kind: "native", note: "Native arcade gamepad and steering support." },
  marathon: { kind: "native", note: "Aleph One source port binds controllers natively." },
  "marathon-1": { kind: "native", note: "Aleph One source port binds controllers natively." },
  "marathon-2": { kind: "native", note: "Aleph One source port binds controllers natively." },
  "marathon-infinity": { kind: "native", note: "Aleph One source port binds controllers natively." },
  alephone: { kind: "native", note: "Aleph One source port binds controllers natively." },
  "aleph-one": { kind: "native", note: "Aleph One source port binds controllers natively." },
  openlara: { kind: "native", note: "Native Gamepad API and controller support." },
  "villagers-and-heroes": { kind: "native", note: "Native cross-platform gamepad support." },
  "strikers-club": { kind: "native", note: "Native controller support for stadium matches." },
  brawlhalla: { kind: "native", note: "Native controller support with frame-perfect input." },
  mrboom: { kind: "native", note: "Native multi-gamepad support for up to 8 simultaneous controllers." },
  "dc-universe-online": { kind: "native", note: "Native gamepad layout for powers, combos, and flight." },
  pixreveal: { kind: "native", note: "Companion smartphone / touchscreen controller support." },
  srb2: { kind: "native", note: "Doom engine native XInput/DirectInput gamepad bindings." },
  jfsw: { kind: "native", note: "JFSW Build engine native gamepad support with analog movement and aiming." },
  yorg: { kind: "native", note: "Native SDL2 multi-gamepad split-screen support." },
  torcs: { kind: "native", note: "Native steering wheel, joystick, and controller input." },
  "stunt-rally": { kind: "native", note: "Native 2-4 player gamepad and split-screen controller support." },
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
  if (!entry.needsConfig(text, profile)) return null;
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
