/**
 * Unknown Horizons stores FIFE display settings in the user config
 * (Documents/My Games/unknown-horizons/settings.xml on Windows).
 *
 * Fresh installs and some GPUs pick a desktop-native resolution that leaves
 * the main menu on a black screen with only the background art. Cap the
 * default to 1280×720 windowed — players can raise it in-game afterward.
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const UH_SLUG = "unknown-horizons";
const DEFAULT_RESOLUTION = "1280x720";
const MAX_AUTO_WIDTH = 1600;

function userConfigPath() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "unknown-horizons", "settings.xml");
  }
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || os.homedir();
    return path.join(home, "Documents", "My Games", "unknown-horizons", "settings.xml");
  }
  const home = os.homedir();
  return path.join(home, ".config", "unknown-horizons", "settings.xml");
}

function parseWidth(resolution) {
  const m = String(resolution || "").match(/^(\d+)\s*x\s*(\d+)$/i);
  return m ? Number(m[1]) : null;
}

function defaultSettingsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Settings>
  <Module name="FIFE">
    <Setting name="FullScreen" type="bool">False</Setting>
    <Setting name="ScreenResolution" type="str">${DEFAULT_RESOLUTION}</Setting>
    <Setting name="RenderBackend" type="str">OpenGL</Setting>
  </Module>
</Settings>
`;
}

/**
 * Ensure UH will open at a safe windowed resolution.
 * Returns true when the file was created or changed.
 */
async function ensureUnknownHorizonsSafeDisplay() {
  const file = userConfigPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });

  if (!fs.existsSync(file)) {
    await fsp.writeFile(file, defaultSettingsXml(), "utf8");
    return true;
  }

  let text = await fsp.readFile(file, "utf8");
  let changed = false;

  const resMatch = text.match(
    /<Setting\s+name="ScreenResolution"[^>]*>\s*([^<]+)\s*<\/Setting>/i
  );
  const width = resMatch ? parseWidth(resMatch[1].trim()) : null;
  const needsRes =
    !resMatch || width == null || width > MAX_AUTO_WIDTH || width < 640;

  if (needsRes) {
    if (resMatch) {
      text = text.replace(
        /(<Setting\s+name="ScreenResolution"[^>]*>)\s*[^<]+\s*(<\/Setting>)/i,
        `$1${DEFAULT_RESOLUTION}$2`
      );
    } else if (/<Module\s+name="FIFE">/i.test(text)) {
      text = text.replace(
        /(<Module\s+name="FIFE">)/i,
        `$1\n\t\t<Setting name="ScreenResolution" type="str">${DEFAULT_RESOLUTION}</Setting>`
      );
    } else {
      await fsp.writeFile(file, defaultSettingsXml(), "utf8");
      return true;
    }
    changed = true;
  }

  /*
   * High native fullscreen is what hangs on a black menu. Force windowed when
   * we had to shrink the resolution, or when FullScreen is missing.
   */
  const fsMatch = text.match(/<Setting\s+name="FullScreen"[^>]*>\s*([^<]+)\s*<\/Setting>/i);
  if (changed || !fsMatch) {
    if (fsMatch) {
      text = text.replace(
        /(<Setting\s+name="FullScreen"[^>]*>)\s*[^<]+\s*(<\/Setting>)/i,
        "$1False$2"
      );
    } else if (/<Module\s+name="FIFE">/i.test(text)) {
      text = text.replace(
        /(<Module\s+name="FIFE">)/i,
        `$1\n\t\t<Setting name="FullScreen" type="bool">False</Setting>`
      );
    }
    changed = true;
  }

  if (changed) {
    await fsp.writeFile(file, text, "utf8");
  }
  return changed;
}

module.exports = {
  UH_SLUG,
  DEFAULT_RESOLUTION,
  userConfigPath,
  ensureUnknownHorizonsSafeDisplay,
};
