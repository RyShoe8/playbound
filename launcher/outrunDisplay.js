"use strict";

/**
 * OutRun (ZgzInfinity, SFML) has no "match my screen" mode. Its window is one
 * of four fixed sizes, or exclusive fullscreen that switches the monitor to
 * 1024x768. PlayBound picks the largest fixed size that fits the player's
 * screen and writes it as `RESOLUTION: <index>` in Resources/Settings/Settings.txt
 * (format read from src/Input/Input.cpp). It never resizes the running window —
 * doing that broke this game's rendering before.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

// Index order from src/Globals.h: SCREEN_0..SCREEN_3.
const OUTRUN_RESOLUTIONS = [
  [921, 691],
  [1024, 768],
  [1280, 720],
  [1366, 768],
];
const OUTRUN_FULLSCREEN_INDEX = OUTRUN_RESOLUTIONS.length; // the game's own "FULLSCREEN" entry

// Title bar and borders, so the whole window is visible on the work area.
const CHROME_W = 16;
const CHROME_H = 40;

/** Largest fixed size (by area) that fits the work area; the smallest if none do. */
function chooseOutrunResolutionIndex(workArea) {
  const availW = Number(workArea?.width) - CHROME_W;
  const availH = Number(workArea?.height) - CHROME_H;
  let best = -1;
  let bestArea = 0;
  OUTRUN_RESOLUTIONS.forEach(([w, h], index) => {
    if (w <= availW && h <= availH && w * h > bestArea) {
      best = index;
      bestArea = w * h;
    }
  });
  return best === -1 ? 0 : best;
}

/**
 * Replace (or append) the RESOLUTION line, leaving every other line as it was.
 * Returns null when nothing should change: an existing FULLSCREEN choice is
 * the player's own and is never overridden.
 */
function patchOutrunSettingsText(text, index) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const line = /^RESOLUTION:[ \t]*(-?\d+)[ \t]*$/m;
  const match = text.match(line);
  if (match) {
    const current = Number(match[1]);
    if (current === OUTRUN_FULLSCREEN_INDEX || current === index) return null;
    return text.replace(line, `RESOLUTION: ${index}`);
  }
  return `${text}${text && !text.endsWith("\n") ? eol : ""}RESOLUTION: ${index}${eol}`;
}

function findOutrunSettings(dirs) {
  for (const dir of dirs.filter(Boolean)) {
    const direct = path.join(dir, "Resources", "Settings", "Settings.txt");
    if (fs.existsSync(direct)) return direct;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const nested = path.join(dir, entry.name, "Resources", "Settings", "Settings.txt");
        if (fs.existsSync(nested)) return nested;
      }
    } catch {
      /* unreadable folder: try the next candidate */
    }
  }
  return null;
}

/**
 * Apply the best-fit window size for this screen. Only ever edits an existing
 * Settings.txt; the game writes its own on first run, and creating one here
 * would mean guessing keys for builds we have not read.
 */
async function ensureOutrunWindowSize({ dirs, workArea }) {
  const file = findOutrunSettings(dirs);
  if (!file) return { changed: false, reason: "settings_not_found" };
  const index = chooseOutrunResolutionIndex(workArea);
  const original = await fsp.readFile(file, "utf8");
  const next = patchOutrunSettingsText(original, index);
  if (next === null) return { changed: false, reason: "already_set", file, index };
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, next, "utf8");
  await fsp.rename(tmp, file);
  return { changed: true, file, index };
}

module.exports = {
  OUTRUN_RESOLUTIONS,
  OUTRUN_FULLSCREEN_INDEX,
  chooseOutrunResolutionIndex,
  patchOutrunSettingsText,
  findOutrunSettings,
  ensureOutrunWindowSize,
};
