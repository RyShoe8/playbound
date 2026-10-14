import fs from "node:fs";
import path from "node:path";

// These are shared installations, not per-customer save directories.
export const INSTALLATION_TARGETS = Object.freeze({
  "counter-strike-2": { name: "Counter-Strike 2", appId: 730, binaries: ["game/bin/linuxsteamrt64/cs2"] },
  "team-fortress-2": { name: "Team Fortress 2", appId: 232250, binaries: ["srcds_linux64"] },
  unturned: { name: "Unturned", appId: 1110390, binaries: ["Unturned_Headless.x86_64"] },
  "counter-strike-source": { name: "Counter-Strike: Source", appId: 232330, binaries: ["srcds_linux"] },
  "core-keeper": { name: "Core Keeper", appId: 1963720, binaries: ["CoreKeeperServer"] },
  "dont-starve-together": { name: "Don't Starve Together", appId: 343050, binaries: ["bin64/dontstarve_dedicated_server_nullrenderer_x64"] },
  barotrauma: { name: "Barotrauma", appId: 1026340, binaries: ["DedicatedServer"] },
  necesse: { name: "Necesse", appId: 1169370, binaries: ["jre/bin/java"], files: ["Server.jar"] },
});

export function installationKey(slug) {
  if (slug === "cs2") return "counter-strike-2";
  if (slug === "tf2" || slug === "open-fortress") return "team-fortress-2";
  return Object.hasOwn(INSTALLATION_TARGETS, slug) ? slug : null;
}

export function verifyInstallation(directory, key) {
  const target = INSTALLATION_TARGETS[key];
  if (!target) throw new Error("Unsupported installation");
  const root = fs.lstatSync(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Installation must be a real directory");
  const manifestPath = path.join(directory, "steamapps", `appmanifest_${target.appId}.acf`);
  if (fs.realpathSync(path.dirname(manifestPath)) !== path.join(fs.realpathSync(directory), "steamapps")) throw new Error("Steam metadata must stay inside the installation");
  if (!fs.lstatSync(manifestPath).isFile() || fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error("Invalid installation manifest");
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const value = (name) => manifest.match(new RegExp(`"${name}"\\s+"([^"\\r\\n]*)"`, "i"))?.[1];
  if (value("appid") !== String(target.appId) || value("StateFlags") !== "4" || !/^\d+$/.test(value("buildid") || "")) {
    throw new Error("Steam installation is incomplete or belongs to another app");
  }
  for (const binary of [...target.binaries, ...(target.files || [])]) {
    const filename = path.join(directory, binary);
    if (!fs.statSync(filename).isFile() || !fs.realpathSync(filename).startsWith(`${fs.realpathSync(directory)}${path.sep}`)) {
      throw new Error("Required server executable is missing");
    }
    if (target.binaries.includes(binary)) fs.accessSync(filename, fs.constants.X_OK);
  }
  return { buildId: value("buildid") };
}

// Absolute internal links must not point back at the live installation while
// SteamCMD modifies staging. External save/plugin links are detached during it.
export function prepareInstallationLinks(directory, original, detachExternal = false) {
  const detached = [];
  const stack = [directory];
  let count = 0;
  while (stack.length) {
    const parent = stack.pop();
    for (const name of fs.readdirSync(parent)) {
      if (++count > 500_000) throw new Error("Installation file count exceeds safe update bounds");
      const filename = path.join(parent, name);
      const entry = fs.lstatSync(filename);
      if (entry.isSymbolicLink()) {
        const raw = fs.readlinkSync(filename);
        const resolved = path.resolve(parent, raw);
        const inside = (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`);
        if (inside(original) || inside(directory)) {
          const root = inside(directory) ? directory : original;
          const relative = path.relative(parent, path.join(directory, path.relative(root, resolved))) || ".";
          fs.unlinkSync(filename);
          fs.symlinkSync(relative, filename);
        } else if (detachExternal) {
          detached.push({ filename, target: raw });
          fs.unlinkSync(filename);
        }
      } else if (entry.isDirectory()) stack.push(filename);
      else if (!entry.isFile()) throw new Error("Installation contains unsupported special files");
    }
  }
  return detached;
}

export function restoreInstallationLinks(links) {
  for (const { filename, target } of links) {
    // Refuse a depot change that now claims a customer-owned link's name.
    try { fs.lstatSync(filename); throw new Error("Depot conflicts with a preserved data link"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    fs.symlinkSync(target, filename);
  }
}
