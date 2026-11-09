"use strict";

/**
 * Per-launch RetroArch settings, passed with --appendconfig so nothing a game
 * needs is written into the shared retroarch.cfg.
 *
 * Two problems this exists for:
 *
 *   1. Leaks between games. RetroArch saves its config on exit, appended
 *      settings included, so one game's folders became every game's: after a
 *      Skylance session, 1942 looked for its Kickstart in Skylance's folder.
 *      Every launch now turns saving off and states the neutral folders, which
 *      also repairs a config that has already leaked.
 *   2. Core options a game needs. The Amiga core (PUAE) looks for a real
 *      Kickstart ROM unless told to use its built-in AROS replacement; Kickstart
 *      ROMs are not ours to ship, so Amiga disks always run on AROS.
 *
 * A game with its own appendconfig (Skylance) is given after this one, so its
 * values win where it sets them.
 */

const fsp = require("fs/promises");
const path = require("path");

/** Core options per core, written to a file RetroArch reads instead of the shared one. */
const CORE_OPTIONS = {
  puae: {
    // Built-in AROS instead of a Kickstart ROM the player does not have.
    puae_kickstart: "aros",
  },
};

function cfgLine(key, value) {
  return `${key} = ${JSON.stringify(String(value).replace(/\\/g, "/"))}`;
}

/** The appendconfig text for a launch. Pure. */
function launchConfigText({ appDir, core, optionsPath }) {
  // RetroArch's own portable folders beside retroarch.exe, where existing
  // per-game files (Mr.Boom, Gambatte) already live.
  const lines = [
    cfgLine("config_save_on_exit", "false"),
    cfgLine("system_directory", path.join(appDir, "system")),
    cfgLine("rgui_config_directory", path.join(appDir, "config")),
  ];
  if (CORE_OPTIONS[core] && optionsPath) {
    lines.push(
      // Read this core's options from PlayBound's file, not per-game files a
      // player may have saved, so the Kickstart choice cannot be lost.
      cfgLine("game_specific_options", "false"),
      cfgLine("global_core_options", "true"),
      cfgLine("core_options_path", optionsPath)
    );
  }
  return `${lines.join("\n")}\n`;
}

function coreOptionsText(core) {
  return `${Object.entries(CORE_OPTIONS[core] || {}).map(([k, v]) => cfgLine(k, v)).join("\n")}\n`;
}

/**
 * Write the launch files and return the --appendconfig value. `extra` is a
 * game's own appendconfig path, joined after ours so it keeps priority.
 */
async function prepareRetroArchLaunch({ root, binary, core, extra = null }) {
  const appDir = path.dirname(binary);
  await fsp.mkdir(path.join(appDir, "system"), { recursive: true });
  await fsp.mkdir(path.join(appDir, "config"), { recursive: true });
  let optionsPath = null;
  if (CORE_OPTIONS[core]) {
    optionsPath = path.join(root, `playbound-${core}-options.cfg`);
    await fsp.writeFile(optionsPath, coreOptionsText(core), "utf8");
  }
  const launchPath = path.join(root, "playbound-launch.cfg");
  await fsp.writeFile(launchPath, launchConfigText({ appDir, core, optionsPath }), "utf8");
  return extra ? `${launchPath}|${extra}` : launchPath;
}

module.exports = { CORE_OPTIONS, launchConfigText, coreOptionsText, prepareRetroArchLaunch };
