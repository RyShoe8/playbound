"use strict";

const fs = require("fs");
const path = require("path");

/** GOG's DOSBox binary needs the game's config files; spawning it bare opens an empty window. */
function resolveGogShadowWarriorLaunch(recordedExe) {
  const name = path.basename(String(recordedExe || "")).toLowerCase();
  if (!name || (name !== "dosbox.exe" && name !== "sw.exe")) return null;
  const exeDir = path.dirname(recordedExe);
  const root = path.basename(exeDir).toLowerCase() === "dosbox" ? path.dirname(exeDir) : exeDir;
  const binary = [
    path.join(root, "DOSBOX", "DOSBox.exe"),
    path.join(root, "DOSBox.exe"),
  ].find((file) => fs.existsSync(file));
  if (!binary) return { error: "GOG's DOSBox executable is missing. Repair the Shadow Warrior install in GOG, then click Locate." };

  let configs = [];
  try {
    configs = fs.readdirSync(root)
      .filter((file) => /^dosbox.*\.conf$/i.test(file) && !/setup|configurator|wanton|twin|[_-]wd\b|[_-]td\b/i.test(file));
  } catch {
    // The error below gives the player a useful next step.
  }
  if (!configs.length) {
    return { error: "Shadow Warrior's GOG DOSBox configuration is missing. Repair the install in GOG, then click Locate." };
  }
  const base = configs.find((file) => /^dosbox_swarrior\.conf$/i.test(file))
    || configs.find((file) => !/single|addon|expansion|settings|client|server/i.test(file));
  const single = configs.find((file) => /^dosbox_swarrior_single\.conf$/i.test(file))
    || configs.find((file) => /single/i.test(file));
  const selected = [base, single].filter(Boolean);
  if (!selected.length) {
    return { error: "Shadow Warrior's main GOG DOSBox configuration is missing. Repair the install in GOG, then click Locate." };
  }
  return {
    binary,
    args: selected.flatMap((file) => ["-conf", path.join(root, file)]).concat("-noconsole", "-c", "exit"),
  };
}

module.exports = { resolveGogShadowWarriorLaunch };
