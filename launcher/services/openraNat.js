/**
 * OpenRA hosting needs an inbound UDP port (default 1234). The engine can
 * open that via UPnP/NAT-PMP, but DiscoverNatDevices is off by default.
 * PlayBound turns it on and, on Windows, asks the firewall to allow the client.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

function openRaSupportDirs() {
  const home = os.homedir();
  const dirs = [];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    dirs.push(path.join(appData, "OpenRA"));
    dirs.push(path.join(home, "Documents", "OpenRA"));
  } else if (process.platform === "darwin") {
    dirs.push(path.join(home, "Library", "Application Support", "OpenRA"));
  } else {
    dirs.push(path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "openra"));
    dirs.push(path.join(home, ".openra"));
  }
  return dirs;
}

function enableDiscoverNat(contents) {
  const text = String(contents || "");
  if (/DiscoverNatDevices\s*:\s*True/i.test(text)) return text;
  if (/DiscoverNatDevices\s*:/i.test(text)) {
    return text.replace(/DiscoverNatDevices\s*:\s*\w+/i, "DiscoverNatDevices: True");
  }
  if (/^Server:\s*$/m.test(text)) {
    return text.replace(/^Server:\s*$/m, "Server:\n\tDiscoverNatDevices: True");
  }
  const prefix = "Server:\n\tDiscoverNatDevices: True\n";
  return text ? `${prefix}${text}` : `${prefix}`;
}

async function ensureOpenRaUpnpSettings() {
  const dirs = openRaSupportDirs();
  let wrote = false;
  for (const dir of dirs) {
    const file = path.join(dir, "settings.yaml");
    try {
      if (fs.existsSync(file)) {
        const prev = await fsp.readFile(file, "utf8");
        const next = enableDiscoverNat(prev);
        if (next !== prev) {
          await fsp.writeFile(file, next, "utf8");
          wrote = true;
        } else if (/DiscoverNatDevices\s*:\s*True/i.test(prev)) {
          wrote = true;
        }
        continue;
      }
      if (fs.existsSync(dir) || dir === dirs[0]) {
        await fsp.mkdir(dir, { recursive: true });
        if (!fs.existsSync(file)) {
          await fsp.writeFile(file, enableDiscoverNat(""), "utf8");
          wrote = true;
        }
      }
    } catch (err) {
      console.warn("[openra-nat] settings.yaml:", err?.message || err);
    }
  }
  return wrote;
}

function ensureWindowsFirewall(exePath) {
  if (process.platform !== "win32" || !exePath || !fs.existsSync(exePath)) return;
  const name = "PlayBound OpenRA";
  const exe = String(exePath).replace(/"/g, "");
  const child = spawn(
    "netsh",
    [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${name}`,
      "dir=in",
      "action=allow",
      `program=${exe}`,
      "enable=yes",
      "profile=any",
    ],
    { windowsHide: true, stdio: "ignore" }
  );
  child.on("error", () => {});
}

async function prepareOpenRaNetwork({ exePath } = {}) {
  await ensureOpenRaUpnpSettings();
  try {
    ensureWindowsFirewall(exePath);
  } catch {
    /* needs admin on some machines — UPnP still helps */
  }
}

function isOpenRaFamily(slug, entry) {
  if (slug === "openra") return true;
  if (entry?.repo === "OpenRA/OpenRA") return true;
  const args = entry?.connectArgs;
  return Array.isArray(args) && args.some((a) => String(a).includes("Game.Connect"));
}

module.exports = {
  enableDiscoverNat,
  ensureOpenRaUpnpSettings,
  prepareOpenRaNetwork,
  isOpenRaFamily,
};
