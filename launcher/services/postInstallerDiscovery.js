"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { isUninstallerExe } = require("./exeCandidates");

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const SKIP = new Set(["windows", "node_modules", ".git", "cache", "temp", "$recycle.bin", "system volume information"]);

/** Search product folders, never recursively walk an entire drive. All I/O yields. */
async function findInstalledExecutable({ entry, roots = [], shortcutRoots = [], wanted = [], readShortcutLink,
  isCancelled = () => false, maxDirectories = 200, maxEntries = 12000, maxMs = 2000 } = {}) {
  const names = new Set(wanted.map((name) => path.basename(name).toLowerCase()).filter((name) => /\.exe$/i.test(name) && !isUninstallerExe(name)));
  if (!names.size) return null;
  const titles = [entry?.title, entry?.slug, ...(entry?.registryTitles || [])].map(normalize).filter((name) => name.length >= 4);
  const matchesFolder = (name) => {
    const value = normalize(name);
    return titles.some((title) => value === title || (value.startsWith(title) && /^(v?\d|win|x64|x86|release)/.test(value.slice(title.length))));
  };
  let directories = 0;
  let entries = 0;
  const deadline = Date.now() + maxMs;
  const exhausted = () => isCancelled() || directories >= maxDirectories || entries >= maxEntries || Date.now() >= deadline;
  const hits = new Map();
  const visited = new Set();
  async function visit(dir, mode, depth = 0) {
    if (exhausted()) return;
    const key = path.resolve(dir).toLowerCase();
    if (visited.has(mode + key)) return;
    visited.add(mode + key);
    directories++;
    let listing;
    try { listing = await fs.opendir(dir); } catch { return; }
    try {
      for await (const item of listing) {
        if (isCancelled() || entries++ >= maxEntries || Date.now() >= deadline) break;
        const full = path.join(dir, item.name);
        if (item.isDirectory() && !SKIP.has(item.name.toLowerCase())) {
          if (mode === "root" && matchesFolder(item.name)) await visit(full, "game");
          else if (mode !== "root" && depth < (mode === "shortcuts" ? 3 : 4)) await visit(full, mode, depth + 1);
        } else if (mode !== "shortcuts" && item.isFile() && names.has(item.name.toLowerCase()) && (mode === "game" || matchesFolder(item.name.replace(/\.exe$/i, "")))) {
          hits.set(path.resolve(full).toLowerCase(), full);
        } else if (mode === "shortcuts" && item.isFile() && /\.lnk$/i.test(item.name) && readShortcutLink) {
          try {
            const link = await readShortcutLink(full);
            // The target name is authoritative; a shortcut called "SRB2Kart" may launch setup.
            const target = link?.target;
            if (target && names.has(path.basename(target).toLowerCase()) && (matchesFolder(item.name.replace(/\.lnk$/i, "")) || matchesFolder(path.basename(target).replace(/\.exe$/i, ""))) && !isUninstallerExe(target) && (await fs.lstat(target)).isFile()) {
              hits.set(path.resolve(target).toLowerCase(), target);
            }
          } catch { /* Broken/unsupported shortcuts and permission errors are ordinary misses. */ }
        }
      }
    } catch { /* Directory removed or access revoked during installation. */ }
  }
  for (const root of [...new Set(roots.filter(Boolean))]) await visit(root, "root");
  for (const root of [...new Set(shortcutRoots.filter(Boolean))]) await visit(root, "shortcuts");
  if (isCancelled()) return null;
  // Leave competing installations for the player to choose, never guess by file size.
  return hits.size === 1 ? [...hits.values()][0] : null;
}

function windowsDiscoveryRoots({ drives = [], home, env = process.env, gamesDir } = {}) {
  const roots = [gamesDir, env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"), env.LOCALAPPDATA];
  if (home) for (const name of ["Games", "Desktop", "Downloads", "Documents"]) roots.push(path.join(home, name));
  for (const drive of drives) for (const name of ["", "Games", "Program Files", "Program Files (x86)"]) roots.push(path.join(drive, name));
  const shortcutRoots = [env.APPDATA && path.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"),
    env.ProgramData && path.join(env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"),
    env.PUBLIC && path.join(env.PUBLIC, "Desktop"), home && path.join(home, "Desktop")];
  return { roots: [...new Set(roots.filter(Boolean))], shortcutRoots: shortcutRoots.filter(Boolean) };
}
module.exports = { findInstalledExecutable, windowsDiscoveryRoots };
