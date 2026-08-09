/**
 * OpenCiv3 (Godot) display settings via override.cfg next to the executable.
 * Upstream ships 1152×768; PlayBound defaults to windowed 1920×1080.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const OPENCIV3_SLUG = "openciv3";

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MIN_DIM = 640;
const MAX_DIM = 7680;

const PRESETS = [
  { label: "1280 × 720", width: 1280, height: 720 },
  { label: "1600 × 900", width: 1600, height: 900 },
  { label: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2560 × 1440", width: 2560, height: 1440 },
];

function clampDim(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(v)));
}

/** Directory that should hold override.cfg (same folder as OpenCiv3.exe). */
function resolveGameDir(gameDirOrExe) {
  if (!gameDirOrExe) return null;
  const resolved = path.resolve(gameDirOrExe);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return path.dirname(resolved);
    }
  } catch {
    /* treat as directory */
  }
  return resolved;
}

function overridePath(gameDirOrExe) {
  const dir = resolveGameDir(gameDirOrExe);
  if (!dir) return null;
  return path.join(dir, "override.cfg");
}

function formatOverrideCfg(width, height) {
  const w = clampDim(width, DEFAULT_WIDTH);
  const h = clampDim(height, DEFAULT_HEIGHT);
  return [
    "; Managed by PlayBound — change via Library → Display",
    "[display]",
    `window/size/window_width_override=${w}`,
    `window/size/window_height_override=${h}`,
    "window/size/resizable=true",
    "window/size/mode=0",
    "window/dpi/allow_hidpi=false",
    "",
  ].join("\n");
}

function parseOverrideCfg(text) {
  let width = null;
  let height = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^window\/size\/window_(width|height)_override\s*=\s*(-?\d+(?:\.\d+)?)\s*$/i);
    if (!m) continue;
    const value = Math.round(Number(m[2]));
    if (m[1].toLowerCase() === "width") width = value;
    else height = value;
  }
  return {
    width: width != null && Number.isFinite(width) ? clampDim(width, DEFAULT_WIDTH) : DEFAULT_WIDTH,
    height: height != null && Number.isFinite(height) ? clampDim(height, DEFAULT_HEIGHT) : DEFAULT_HEIGHT,
  };
}

async function readDisplaySettings(gameDirOrExe) {
  const cfgPath = overridePath(gameDirOrExe);
  if (!cfgPath || !fs.existsSync(cfgPath)) {
    return {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      exists: false,
      path: cfgPath,
      presets: PRESETS,
    };
  }
  const text = await fsp.readFile(cfgPath, "utf8");
  const parsed = parseOverrideCfg(text);
  return {
    ...parsed,
    exists: true,
    path: cfgPath,
    presets: PRESETS,
  };
}

async function writeDisplaySettings(gameDirOrExe, { width, height } = {}) {
  const dir = resolveGameDir(gameDirOrExe);
  const cfgPath = overridePath(dir);
  if (!dir || !cfgPath) throw new Error("OpenCiv3 install folder not found");
  await fsp.mkdir(dir, { recursive: true });
  const w = clampDim(width, DEFAULT_WIDTH);
  const h = clampDim(height, DEFAULT_HEIGHT);
  await fsp.writeFile(cfgPath, formatOverrideCfg(w, h), "utf8");
  return { width: w, height: h, path: cfgPath, exists: true, presets: PRESETS };
}

/**
 * Write default 1920×1080 only when override.cfg is missing so user
 * Library → Display choices survive subsequent Play launches.
 */
async function ensureDefaultDisplaySettings(gameDirOrExe) {
  const cfgPath = overridePath(gameDirOrExe);
  if (!cfgPath) return null;
  if (fs.existsSync(cfgPath)) {
    return readDisplaySettings(gameDirOrExe);
  }
  return writeDisplaySettings(gameDirOrExe, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
}

module.exports = {
  OPENCIV3_SLUG,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  PRESETS,
  overridePath,
  resolveGameDir,
  readDisplaySettings,
  writeDisplaySettings,
  ensureDefaultDisplaySettings,
};
