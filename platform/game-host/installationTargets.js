import fs from "node:fs";
import path from "node:path";
import { verifyMindustryInstallation } from "./mindustryUpdates.js";
import { verifyOpenRAInstallation } from "./openraUpdates.js";
import { verifyOpenHVInstallation } from "./openhvUpdates.js";
import { verifyOpenE2140Installation } from "./openE2140Updates.js";
import { verifyHypersomniaInstallation } from "./hypersomniaUpdates.js";
import { verifyAssaultCubeInstallation } from "./assaultcubeUpdates.js";
import { verifyFactorioInstallation } from "./factorioUpdates.js";
import { verifyTerrariaInstallation } from "./terrariaUpdates.js";
import { verifyNativePackageInstallation } from "./nativePackageUpdates.js";
import { verifyRimworldInstallation } from "./rimworldUpdates.js";
import { verifyXonoticInstallation } from "./xonoticUpdates.js";
import { verifyFgmsInstallation } from "./fgmsUpdates.js";
import { verifyEtlegacyInstallation } from "./etlegacyUpdates.js";
import { verifyOpenMohaaInstallation } from "./openmohaaUpdates.js";
import { verifyUnvanquishedInstallation } from "./unvanquishedUpdates.js";
import { verifyReviewedComponent } from "./reviewedComponentUpdates.js";
import { verifyPairedInstallation } from "./pairedRuntimeUpdates.js";
import { verifyReviewedJava } from "./reviewedJavaUpdates.js";

// These are shared installations, not per-customer save directories.
export const INSTALLATION_TARGETS = Object.freeze({
  "counter-strike-2": { name: "Counter-Strike 2", appId: 730, binaries: ["game/bin/linuxsteamrt64/cs2"] },
  "team-fortress-2": { name: "Team Fortress 2", appId: 232250, binaries: ["srcds_linux64"] },
  unturned: { name: "Unturned", appId: 1110390, binaries: ["Unturned_Headless.x86_64"] },
  "counter-strike-source": { name: "Counter-Strike: Source", appId: 232330, binaries: ["srcds_linux"] },
  "core-keeper": { name: "Core Keeper", appId: 1963720, binaries: ["CoreKeeperServer"] },
  "dont-starve-together": { name: "Don't Starve Together", appId: 343050, binaries: ["bin64/dontstarve_dedicated_server_nullrenderer_x64"] },
  barotrauma: {
    name: "Barotrauma", appId: 1026340, binaries: ["DedicatedServer"],
  },
  necesse: { name: "Necesse", appId: 1169370, binaries: ["jre/bin/java"], files: ["Server.jar"] },
  "aneurism-iv": { name: "ANEURISM IV", appId: 2832030, binaries: ["aniv_server.x86_64"], files: ["UnityPlayer.so", "aniv_server_Data/boot.config"] },
  "wolfenstein-enemy-territory": { name: "Wolfenstein: Enemy Territory (ET: Legacy)", strategy: "reviewed-etlegacy-package" },
  openmohaa: { name: "Medal of Honor: Allied Assault (OpenMoHAA)", strategy: "reviewed-openmohaa-package" },
  unvanquished: { name: "Unvanquished (engine and game packages)", strategy: "reviewed-unvanquished-package" },
  "battlefield-1942-anthology": { name: "Battlefield 1942 (reviewed static engine)", strategy: "reviewed-component", component: "bf1942_lnxded.static" },
  "re-volt-rvgl": { name: "RVGL (reviewed Linux engine)", strategy: "reviewed-component", component: "rvgl.64" },
  morrowind: { name: "Morrowind (reviewed TES3MP engine)", strategy: "reviewed-component", component: "tes3mp-server.x86_64" },
  bombsquad: { name: "BombSquad (paired controller and game distribution)", strategy: "paired-runtime", component: "runtime" },
  veloren: { name: "Veloren (paired weekly engine and assets)", strategy: "paired-runtime", component: "runtime" },
  ysoccer: { name: "YSoccer (PlayBound dedicated Java server)", strategy: "reviewed-java", component: "ysoccer-server.jar" },
  triplea: { name: "TripleA (reviewed Java 25 headless server)", strategy: "reviewed-java", component: "bin" },
  mindustry: { name: "Mindustry", strategy: "github-jar" },
  openra: { name: "OpenRA (Red Alert, Tiberian Dawn, Dune 2000)", strategy: "github-appimage" },
  openhv: { name: "OpenHV", strategy: "github-appimage" },
  "earth-2140-trilogy": { name: "Earth 2140 Trilogy (OpenE2140)", strategy: "github-appimage" },
  hypersomnia: { name: "Hypersomnia", strategy: "signed-appimage" },
  assaultcube: { name: "AssaultCube (native binaries)", strategy: "github-native-binaries", component: "bin_unix" },
  factorio: { name: "Factorio (stable headless)", strategy: "official-headless-archive" },
  terraria: { name: "Terraria (reviewed 1.4.5.8 Linux server)", strategy: "official-linux-zip", component: "1458" },
  bzflag: { name: "BZFlag (reviewed Ubuntu native server)", strategy: "reviewed-distro-native" },
  hedgewars: { name: "Hedgewars (reviewed Ubuntu native server)", strategy: "reviewed-distro-native" },
  openttd: { name: "OpenTTD (reviewed Ubuntu native server)", strategy: "reviewed-distro-native" },
  luanti: { name: "Luanti (reviewed Minetest native server)", strategy: "reviewed-distro-native" },
  "battle-for-wesnoth": { name: "Battle for Wesnoth (reviewed 1.18 server)", strategy: "reviewed-distro-native", component: "wesnothd" },
  "rimworld-together": { name: "RimWorld Together (reviewed PlayBound source build)", strategy: "reviewed-dotnet-source" },
  supertuxkart: { name: "SuperTuxKart (reviewed Ubuntu native server)", strategy: "reviewed-distro-native", component: "supertuxkart" },
  openarena: { name: "OpenArena (reviewed ioquake3 dedicated engine)", strategy: "reviewed-distro-native", component: "openarena-server" },
  xonotic: { name: "Xonotic (reviewed 0.8.6 dedicated engine)", strategy: "reviewed-native-zip", component: "xonotic-linux64-dedicated" },
  "0ad": { name: "0 A.D. (reviewed Alpha 26 engine)", strategy: "reviewed-distro-native", component: "pyrogenesis" },
  teeworlds: { name: "Teeworlds (reviewed Ubuntu native server)", strategy: "reviewed-distro-native" },
  flightgear: { name: "FlightGear (reviewed fgms relay)", strategy: "reviewed-cmake-source", component: "fgms" },
});

export function installationKey(slug) {
  if (slug === "0-ad") return "0ad";
  if (slug === "cs2") return "counter-strike-2";
  if (slug === "tf2" || slug === "open-fortress") return "team-fortress-2";
  if (slug === "opene2140") return "earth-2140-trilogy";
  if (slug === "medal-of-honor-allied-assault") return "openmohaa";
  return Object.hasOwn(INSTALLATION_TARGETS, slug) ? slug : null;
}

// OpenRA editions can select (or fall back to) the shared variant binaries.
// Hold these installations conservatively, including while a start is pending.
export function installationDependencies(slug) {
  if (slug === "openra") return ["openra", "openhv", "earth-2140-trilogy"];
  const key = installationKey(slug);
  return key ? [key] : [];
}

export function verifyInstallation(directory, key) {
  const target = INSTALLATION_TARGETS[key];
  if (!target) throw new Error("Unsupported installation");
  const root = fs.lstatSync(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Installation must be a real directory");
  if (target.strategy === "github-jar") return verifyMindustryInstallation(directory);
  if (key === "openhv") return verifyOpenHVInstallation(directory);
  if (key === "earth-2140-trilogy") return verifyOpenE2140Installation(directory);
  if (key === "hypersomnia") return verifyHypersomniaInstallation(directory);
  if (key === "assaultcube") return verifyAssaultCubeInstallation(directory);
  if (key === "factorio") return verifyFactorioInstallation(directory);
  if (key === "terraria") return verifyTerrariaInstallation(directory);
  if (key === "xonotic") return verifyXonoticInstallation(directory);
  if (key === "wolfenstein-enemy-territory") return verifyEtlegacyInstallation(directory);
  if (key === "openmohaa") return verifyOpenMohaaInstallation(directory);
  if (key === "unvanquished") return verifyUnvanquishedInstallation(directory);
  if (target.strategy === "reviewed-component") return verifyReviewedComponent(directory, key);
  if (target.strategy === "paired-runtime") return verifyPairedInstallation(directory, key);
  if (target.strategy === "reviewed-java") return verifyReviewedJava(directory, key);
  if (target.strategy === "reviewed-distro-native") return verifyNativePackageInstallation(directory, key);
  if (target.strategy === "reviewed-dotnet-source") return verifyRimworldInstallation(directory);
  if (target.strategy === "reviewed-cmake-source") return verifyFgmsInstallation(directory);
  if (target.strategy === "github-appimage") return verifyOpenRAInstallation(directory);
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
  return { buildId: value("buildid"), ...(value("BetaKey") ? { branch: value("BetaKey") } : {}) };
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
