"use strict";

/**
 * Steam-installed editions: which Steam app an edition is, and whether an
 * existing install record should be replaced.
 *
 * An edition can name its Steam app three ways: a `steam` install method
 * ({ steam: { appId } }), a PlayBound recipe that hands off to Steam
 * (playbound_installer.steamAppId), or only a steam:// link. Lambda Wars uses
 * the first, Alien Swarm: Reactive Drop the second, and Alien Swarm's own
 * virtual edition the third. Detection used to follow none of them for an
 * edition, so a finished Steam install showed "Install detected" (the base
 * game was found) while the edition's button stayed on Install.
 */

const STEAM_LINK = /^steam:\/\/(?:install|run|rungameid|store)\/(\d+)/i;

function steamAppIdFromLink(value) {
  return STEAM_LINK.exec(String(value || ""))?.[1] || null;
}

function numericId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

/**
 * The Steam app id an edition installs, or null when Steam is not what
 * installs it.
 *
 * Only an edition Steam actually installs qualifies: a `steam` install method,
 * a PlayBound recipe of the `external` hand-off kind, or no PlayBound recipe
 * and a steam:// install link. A recipe that downloads a build itself never
 * qualifies, even when it records a Steam app id: HoloCure's itch.io edition
 * must not be claimed by the Steam copy of its sibling.
 */
function editionSteamAppId(edition) {
  const cfg = edition?.installConfig || {};
  const recipe = cfg.playbound_installer;
  if (edition?.installMethod === "steam") {
    return numericId(cfg.steam?.appId) || steamAppIdFromLink(edition?.installAction?.href);
  }
  if (recipe?.kind) {
    if (recipe.kind !== "external") return null;
    return numericId(recipe.steamAppId) || steamAppIdFromLink(recipe.url);
  }
  return steamAppIdFromLink(cfg.external_installer?.url) || steamAppIdFromLink(edition?.installAction?.href);
}

/** The executable hint an edition's recipe gives, if any. */
function editionExeHint(edition) {
  return edition?.installConfig?.playbound_installer?.exeHint || null;
}

/**
 * Source and GoldSrc dedicated-server binaries ship in the game folder beside
 * the real executable. They are never what Play should start; Alien Swarm was
 * recorded as srcds.exe.
 */
function isDedicatedServerExe(exePath) {
  const base = String(exePath || "").split(/[\\/]/).pop().toLowerCase();
  return /^(srcds|srcds_console|srcds_win64|hlds)\.exe$/.test(base);
}

/** Whether an edition's install record still needs Steam detection. */
function needsSteamDetection(record, exeExists) {
  if (!record?.exe) return true;
  if (isDedicatedServerExe(record.exe)) return true;
  return !exeExists(record.exe);
}

module.exports = { steamAppIdFromLink, editionSteamAppId, editionExeHint, isDedicatedServerExe, needsSteamDetection };
