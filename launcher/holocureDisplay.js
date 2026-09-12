/**
 * HoloCure display prefs live in %LOCALAPPDATA%\HoloCure\settings.json.
 * PlayBound defaults fullscreen on so party/couch launches are not windowed.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const DEFAULT_CONTROLLER_BUTTONS = [
  "gp_face1",
  "gp_shoulderlb",
  "gp_face2",
  "gp_shoulderrb",
  "gp_start",
  "gp_select",
  "gp_face3",
];

function settingsPath(localAppData) {
  const root =
    localAppData ||
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : null) ||
    path.join(os.homedir(), "AppData", "Local");
  return path.join(root, "HoloCure", "settings.json");
}

/**
 * Merge-patch fullscreen:true. Seeds controllerButtons only when creating a
 * brand-new file. Never overwrites an existing controllerButtons array.
 */
async function ensureHolocureFullscreen(opts = {}) {
  const file = settingsPath(opts.localAppData);
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });

  let data = {};
  let existed = false;
  try {
    if (fs.existsSync(file)) {
      existed = true;
      const raw = await fsp.readFile(file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed;
      }
    }
  } catch {
    data = {};
  }

  const next = { ...data, fullscreen: true };
  if (!existed && !Array.isArray(next.controllerButtons)) {
    next.controllerButtons = [...DEFAULT_CONTROLLER_BUTTONS];
  }

  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(next)}\n`, "utf8");
  await fsp.rename(tmp, file);
  return { path: file, fullscreen: true, created: !existed };
}

module.exports = {
  settingsPath,
  ensureHolocureFullscreen,
  DEFAULT_CONTROLLER_BUTTONS,
};
