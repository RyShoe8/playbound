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

function configureOpenRaSettings(contents) {
  let text = String(contents || "");

  // Turn DiscoverNatDevices off: UPnP lease queries on consumer routers hang for 5-10
  // seconds periodically and cause OpenRA to freeze during gameplay. PlayBound handles
  // network routing via managed servers and NetBird virtual LANs instead.
  if (/DiscoverNatDevices\s*:\s*False/i.test(text)) {
    // already disabled
  } else if (/DiscoverNatDevices\s*:/i.test(text)) {
    text = text.replace(/DiscoverNatDevices\s*:\s*\w+/i, "DiscoverNatDevices: False");
  } else if (/^Server:\s*$/m.test(text)) {
    text = text.replace(/^Server:\s*$/m, "Server:\n\tDiscoverNatDevices: False");
  } else {
    text = text ? `Server:\n\tDiscoverNatDevices: False\n${text}` : "Server:\n\tDiscoverNatDevices: False\n";
  }

  // Set timeout to 1000ms max to prevent any lingering delay if enabled manually
  if (/NatDiscoveryTimeout\s*:\s*\d+/i.test(text)) {
    text = text.replace(/NatDiscoveryTimeout\s*:\s*\d+/i, "NatDiscoveryTimeout: 1000");
  }

  return text;
}

async function ensureOpenRaUpnpSettings() {
  const dirs = openRaSupportDirs();
  let wrote = false;
  for (const dir of dirs) {
    const file = path.join(dir, "settings.yaml");
    try {
      if (fs.existsSync(file)) {
        const prev = await fsp.readFile(file, "utf8");
        const next = configureOpenRaSettings(prev);
        if (next !== prev) {
          await fsp.writeFile(file, next, "utf8");
          wrote = true;
        } else if (/DiscoverNatDevices\s*:\s*False/i.test(prev)) {
          wrote = true;
        }
        continue;
      }
      if (fs.existsSync(dir) || dir === dirs[0]) {
        await fsp.mkdir(dir, { recursive: true });
        if (!fs.existsSync(file)) {
          await fsp.writeFile(file, configureOpenRaSettings(""), "utf8");
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
  // Both spellings: Launch.Connect is OpenRA's real setting, Game.Connect is
  // the incorrect one older catalog recipes carried.
  return (
    Array.isArray(args) &&
    args.some((a) => /\b(Launch|Game)\.Connect\b/.test(String(a)))
  );
}

/*
 * `enableDiscoverNat` was exported here until it took the launcher down.
 *
 * The function was removed when this module inverted its behaviour — it used
 * to turn OpenRA's DiscoverNatDevices on, and now turns it off, because the
 * UPnP lease queries froze the game — but the export line stayed. Nothing ever
 * called it, so the only thing it did was throw ReferenceError the moment this
 * module was required, and main.js requires it at the top level, so the whole
 * app failed to start.
 *
 * Parsing cannot catch this: the file is valid JavaScript and the error only
 * exists at evaluation. check-launcher-syntax.js now requires each module as
 * well as parsing it, so a dangling export cannot ship again.
 */
module.exports = {
  configureOpenRaSettings,
  ensureOpenRaUpnpSettings,
  prepareOpenRaNetwork,
  isOpenRaFamily,
};
