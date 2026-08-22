/**
 * OpenTTD reads multiplayer identity from private.cfg (modern builds) as
 * [network] client_name. Without it the client refuses to join with
 * "your player name hasn't been set".
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { app } = require("electron");

/** OpenTTD network.client_name storage limit. */
const MAX_CLIENT_NAME_LEN = 32;

function openTtdUserDataDir() {
  const home = app.getPath("home");
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : path.join(home, ".config"));
  return path.join(appData, "OpenTTD");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip characters OpenTTD rejects and cap length. */
function sanitizeClientName(name) {
  const trimmed = String(name || "")
    .trim()
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\w \-.']/g, "")
    .trim()
    .slice(0, MAX_CLIENT_NAME_LEN);
  return trimmed || "Player";
}

/**
 * Set or replace one key inside an ini section. Preserves unrelated lines.
 * Appends the section when missing.
 */
function mergeIniSetting(text, section, key, value) {
  const lines = String(text || "").split(/\r?\n/);
  const sectionLower = section.toLowerCase();
  let inSection = false;
  let keyReplaced = false;
  let sawSection = false;
  const out = [];

  for (const line of lines) {
    const sectMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectMatch) {
      if (inSection && !keyReplaced) {
        out.push(`${key} = ${value}`);
        keyReplaced = true;
      }
      inSection = sectMatch[1].toLowerCase() === sectionLower;
      if (inSection) sawSection = true;
      out.push(line);
      continue;
    }
    if (inSection && new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "i").test(line)) {
      out.push(`${key} = ${value}`);
      keyReplaced = true;
      continue;
    }
    out.push(line);
  }

  if (sawSection && inSection && !keyReplaced) {
    out.push(`${key} = ${value}`);
    keyReplaced = true;
  }

  if (!sawSection) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push(`[${section}]`);
    out.push(`${key} = ${value}`);
  }

  const joined = out.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

async function writeClientNameFile(filePath, clientName) {
  let existing = "";
  try {
    existing = await fsp.readFile(filePath, "utf8");
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  const next = mergeIniSetting(existing, "network", "client_name", clientName);
  if (next === existing) return false;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, next, "utf8");
  return true;
}

/**
 * Ensure OpenTTD knows who is joining before `-n host:port` connects.
 * Writes private.cfg (current OpenTTD) and openttd.cfg (legacy fallback).
 */
async function ensureOpenTtdClientName(rawName) {
  const clientName = sanitizeClientName(rawName);
  const dir = openTtdUserDataDir();
  await fsp.mkdir(dir, { recursive: true });
  const privateCfg = path.join(dir, "private.cfg");
  const legacyCfg = path.join(dir, "openttd.cfg");
  await writeClientNameFile(privateCfg, clientName);
  try {
    if (fs.existsSync(legacyCfg)) {
      await writeClientNameFile(legacyCfg, clientName);
    }
  } catch {
    /* legacy optional */
  }
  return { clientName, dir };
}

module.exports = {
  MAX_CLIENT_NAME_LEN,
  sanitizeClientName,
  mergeIniSetting,
  openTtdUserDataDir,
  ensureOpenTtdClientName,
};
