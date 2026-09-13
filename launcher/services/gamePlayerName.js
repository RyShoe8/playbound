/**
 * Auto-configures player name / username / profile identity across PlayBound games.
 * Supports config file pre-seeding and command-line launch argument injection.
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const MAX_NAME_LEN = 32;

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Clean up player name for game engines (strip dangerous control chars, quotes, semicolons). */
function sanitizePlayerName(name, maxLen = MAX_NAME_LEN) {
  const cleaned = String(name || "")
    .trim()
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/[";\\`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen) || "Player";
}

/** Generate a default server name from a player/PlayBound username. */
function defaultServerName(playerName) {
  const safe = sanitizePlayerName(playerName);
  if (!safe || safe.toLowerCase() === "player") {
    return "PlayBound Server";
  }
  return `${safe}'s Server`;
}

/** Clean up server/room/session name for game engines. */
function sanitizeServerName(name, maxLen = 48) {
  const cleaned = String(name || "")
    .trim()
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/[";\\`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen) || "PlayBound Server";
}

/** Set or replace a key inside an INI section. */
function updateIniSetting(text, section, key, value) {
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

/** Set or replace a property inside an OpenRA-style YAML section. */
function updateYamlProperty(text, section, key, value) {
  const lines = String(text || "").split(/\r?\n/);
  let inSection = false;
  let keyReplaced = false;
  let sawSection = false;
  const out = [];

  for (const line of lines) {
    if (/^[A-Za-z0-9_@]+:\s*$/.test(line)) {
      const currentSection = line.trim().replace(/:$/, "");
      if (inSection && !keyReplaced) {
        out.push(`\t${key}: ${value}`);
        keyReplaced = true;
      }
      inSection = currentSection.toLowerCase() === section.toLowerCase();
      if (inSection) sawSection = true;
      out.push(line);
      continue;
    }
    if (inSection && new RegExp(`^\\s*${escapeRegExp(key)}:`, "i").test(line)) {
      out.push(`\t${key}: ${value}`);
      keyReplaced = true;
      continue;
    }
    out.push(line);
  }

  if (sawSection && inSection && !keyReplaced) {
    out.push(`\t${key}: ${value}`);
    keyReplaced = true;
  }

  if (!sawSection) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push(`${section}:`);
    out.push(`\t${key}: ${value}`);
  }

  const joined = out.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

/** Set or replace a Quake / id Tech / DarkPlaces cvar setting (e.g. seta name "Jacky"). */
function updateCvarSetting(text, cvar, value) {
  const lines = String(text || "").split(/\r?\n/);
  const regex = new RegExp(`^\\s*(seta|set)\\s+${escapeRegExp(cvar)}\\s+`, "i");
  let replaced = false;
  const cleanVal = String(value || "").replace(/"/g, "");

  const out = lines.map((line) => {
    if (regex.test(line)) {
      replaced = true;
      return `seta ${cvar} "${cleanVal}"`;
    }
    return line;
  });

  if (!replaced) {
    out.push(`seta ${cvar} "${cleanVal}"`);
  }

  const joined = out.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

/** Set or replace a key-value setting in a flat config file (e.g. key = "val" or key = val). */
function updateKeyValueSetting(text, key, value, options = {}) {
  const { quote = false, separator = " = " } = options;
  const lines = String(text || "").split(/\r?\n/);
  const regex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*[=:]`, "i");
  const cleanVal = quote ? `"${String(value).replace(/"/g, "")}"` : String(value);
  let replaced = false;

  const out = lines.map((line) => {
    if (regex.test(line)) {
      replaced = true;
      return `${key}${separator}${cleanVal}`;
    }
    return line;
  });

  if (!replaced) {
    out.push(`${key}${separator}${cleanVal}`);
  }

  const joined = out.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

/** Helper to safely read, modify, and write a text file. */
async function modifyConfigFile(filePath, modifier) {
  try {
    let existing = "";
    try {
      existing = await fsp.readFile(filePath, "utf8");
    } catch (err) {
      if (err?.code !== "ENOENT") return false;
    }
    const updated = modifier(existing);
    if (updated === existing) return true;
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, updated, "utf8");
    return true;
  } catch (err) {
    console.warn(`[player-name] Could not update config file ${filePath}:`, err?.message || err);
    return false;
  }
}

/**
 * Configure on-disk game profiles / settings before launch.
 */
async function autoConfigureGamePlayerName(opts = {}) {
  const {
    slug,
    gameDir = "",
    playerName,
    serverName,
    userDataPath = "",
    homeDir = process.env.USERPROFILE || process.env.HOME || "",
    appDataDir = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
    localAppDataDir = process.env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local"),
  } = opts;

  if (!slug || !playerName) return false;
  const name = sanitizePlayerName(playerName);
  const sName = sanitizeServerName(serverName || defaultServerName(name));
  const s = String(slug).toLowerCase();

  try {
    // 1. OpenTTD
    if (s === "openttd") {
      const privateCfg = path.join(appDataDir, "OpenTTD", "private.cfg");
      const openTtdCfg = path.join(appDataDir, "OpenTTD", "openttd.cfg");
      const candidates = [privateCfg, openTtdCfg, gameDir ? path.join(gameDir, "openttd.cfg") : null].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateIniSetting(txt, "network", "client_name", name);
          return updateIniSetting(updated, "network", "server_name", sName);
        });
      }
      return true;
    }

    // 2. OpenRA family (Red Alert, Tiberian Dawn, Dune 2000, Combined Arms, OpenHV, OpenE2140)
    if (s === "openra" || s === "openhv" || s === "earth-2140-trilogy") {
      const openRaYaml = path.join(appDataDir, "OpenRA", "settings.yaml");
      const openHvYaml = path.join(appDataDir, "OpenHV", "settings.yaml");
      await modifyConfigFile(openRaYaml, (txt) => {
        let updated = updateYamlProperty(txt, "Player", "Name", name);
        return updateYamlProperty(updated, "Server", "Name", sName);
      });
      if (s === "openhv") {
        await modifyConfigFile(openHvYaml, (txt) => {
          let updated = updateYamlProperty(txt, "Player", "Name", name);
          return updateYamlProperty(updated, "Server", "Name", sName);
        });
      }
      return true;
    }

    // 3. 0 A.D.
    if (s === "0ad" || s === "0-ad") {
      for (const base of [path.join(appDataDir, "0ad", "config"), path.join(localAppDataDir, "0ad", "config")]) {
        const userCfg = path.join(base, "user.cfg");
        await modifyConfigFile(userCfg, (txt) => {
          let updated = updateKeyValueSetting(txt, "playername.singleplayer", name, { quote: true });
          updated = updateKeyValueSetting(updated, "playername.multiplayer", name, { quote: true });
          updated = updateKeyValueSetting(updated, "autostart.matchname", sName, { quote: true });
          return updateKeyValueSetting(updated, "multiplayer.server.matchname", sName, { quote: true });
        });
      }
      return true;
    }

    // 4. OpenArena
    if (s === "openarena") {
      const q3cfg = path.join(appDataDir, "OpenArena", "baseoa", "q3config.cfg");
      await modifyConfigFile(q3cfg, (txt) => {
        let updated = updateCvarSetting(txt, "name", name);
        return updateCvarSetting(updated, "sv_hostname", sName);
      });
      return true;
    }

    // 5. Wolfenstein: Enemy Territory
    if (s === "wolfenstein-enemy-territory") {
      const candidates = [
        path.join(localAppDataDir, "OpenET", "etmain", "profiles", "default", "etconfig.cfg"),
        path.join(appDataDir, "etmain", "profiles", "default", "etconfig.cfg"),
        gameDir ? path.join(gameDir, "etmain", "profiles", "default", "etconfig.cfg") : null,
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateCvarSetting(txt, "name", name);
          return updateCvarSetting(updated, "sv_hostname", sName);
        });
      }
      return true;
    }

    // 6. Dune Legacy
    if (s === "dune-legacy") {
      const iniPath = path.join(appDataDir, "dunelegacy", "dunelegacy.ini");
      await modifyConfigFile(iniPath, (txt) => {
        let updated = updateIniSetting(txt, "General", "PlayerName", name);
        updated = updateIniSetting(updated, "Network", "PlayerName", name);
        return updateIniSetting(updated, "Network", "ServerName", sName);
      });
      return true;
    }

    // 7. KeeperFX
    if (s === "keeperfx" && gameDir) {
      const cfgPath = path.join(gameDir, "keeperfx.cfg");
      await modifyConfigFile(cfgPath, (txt) => {
        let updated = updateKeyValueSetting(txt, "PLAYER_NAME", name);
        return updateKeyValueSetting(updated, "SESSION_NAME", sName);
      });
      return true;
    }

    // 8. TES3MP / Morrowind
    if ((s === "tes3mp" || s === "morrowind") && gameDir) {
      for (const f of ["tes3mp-client-default.cfg", "tes3mp-client.cfg"]) {
        const p = path.join(gameDir, f);
        await modifyConfigFile(p, (txt) => updateIniSetting(txt, "General", "name", name));
      }
      for (const f of ["tes3mp-server-default.cfg", "tes3mp-server.cfg"]) {
        const p = path.join(gameDir, f);
        await modifyConfigFile(p, (txt) => updateIniSetting(txt, "General", "hostname", sName));
      }
      return true;
    }

    // 9. Luanti / Minetest
    if (s === "luanti") {
      const candidates = [
        gameDir ? path.join(gameDir, "minetest.conf") : null,
        path.join(appDataDir, "Minetest", "minetest.conf"),
        path.join(appDataDir, "Luanti", "minetest.conf"),
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateKeyValueSetting(txt, "name", name);
          updated = updateKeyValueSetting(updated, "server_name", sName);
          return updateKeyValueSetting(updated, "server_description", sName);
        });
      }
      return true;
    }

    // 10. Xonotic
    if (s === "xonotic") {
      const candidates = [
        path.join(homeDir, "Saved Games", "xonotic", "data", "config.cfg"),
        gameDir ? path.join(gameDir, "data", "data", "config.cfg") : null,
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateCvarSetting(txt, "_cl_name", name);
          return updateCvarSetting(updated, "hostname", sName);
        });
      }
      return true;
    }

    // 11. Unvanquished
    if (s === "unvanquished") {
      const cfgPath = path.join(localAppDataDir, "Unvanquished", "config", "autogen.cfg");
      await modifyConfigFile(cfgPath, (txt) => {
        let updated = updateCvarSetting(txt, "name", name);
        return updateCvarSetting(updated, "sv_hostname", sName);
      });
      return true;
    }

    // 12. Freedoom / Zandronum
    if (s === "freedoom" || s === "zandronum") {
      const candidates = [
        path.join(homeDir, "Documents", "Zandronum", "zandronum.ini"),
        gameDir ? path.join(gameDir, "zandronum.ini") : null,
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateIniSetting(txt, "GlobalSettings", "name", name);
          return updateIniSetting(updated, "LocalServer", "sv_hostname", sName);
        });
      }
      return true;
    }

    // 13. AssaultCube
    if (s === "assaultcube") {
      const candidates = [
        path.join(appDataDir, "AssaultCube_v1.3", "config", "saved.cfg"),
        gameDir ? path.join(gameDir, "config", "saved.cfg") : null,
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => updateKeyValueSetting(txt, "name", name, { quote: true, separator: " " }));
      }
      if (gameDir) {
        const srvInit = path.join(gameDir, "config", "server_init.cfg");
        await modifyConfigFile(srvInit, (txt) => updateKeyValueSetting(txt, "serverdesc", sName, { quote: true, separator: " " }));
      }
      return true;
    }

    // 14. Teeworlds
    if (s === "teeworlds") {
      const cfgPath = path.join(appDataDir, "Teeworlds", "settings.cfg");
      await modifyConfigFile(cfgPath, (txt) => {
        let updated = updateKeyValueSetting(txt, "player_name", name, { quote: true, separator: " " });
        return updateKeyValueSetting(updated, "sv_name", sName, { quote: true, separator: " " });
      });
      if (gameDir) {
        for (const f of ["server.cfg", "autoexec.cfg"]) {
          await modifyConfigFile(path.join(gameDir, f), (txt) => updateKeyValueSetting(txt, "sv_name", sName, { quote: true, separator: " " }));
        }
      }
      return true;
    }

    // 15. Freeciv
    if (s === "freeciv") {
      const cfgPath = path.join(appDataDir, "freeciv", "freeciv-client.conf");
      await modifyConfigFile(cfgPath, (txt) => {
        let updated = updateKeyValueSetting(txt, "player.name", name, { quote: true, separator: "=" });
        return updateKeyValueSetting(updated, "server.server_name", sName, { quote: true, separator: "=" });
      });
      return true;
    }

    // 16. Hedgewars
    if (s === "hedgewars") {
      for (const base of [homeDir, appDataDir]) {
        const p = path.join(base, ".hedgewars", "settings.ini");
        await modifyConfigFile(p, (txt) => {
          let updated = updateIniSetting(txt, "net", "nick", name);
          return updateIniSetting(updated, "net", "servername", sName);
        });
      }
      return true;
    }

    // 17. SuperTuxKart
    if (s === "supertuxkart") {
      const playersXml = path.join(appDataDir, "supertuxkart", "config-0.10", "players.xml");
      await modifyConfigFile(playersXml, (txt) => {
        if (!txt) return txt;
        return txt.replace(/<player\s+name="[^"]*"/i, `<player name="${name.replace(/"/g, "&quot;")}"`);
      });
      const serverXml = path.join(appDataDir, "supertuxkart", "config-0.10", "server_config.xml");
      await modifyConfigFile(serverXml, (txt) => {
        if (!txt) return txt;
        return txt.replace(/<server\s+name="[^"]*"/i, `<server name="${sName.replace(/"/g, "&quot;")}"`);
      });
      return true;
    }

    // 18. Battle for Wesnoth
    if (s === "battle-for-wesnoth") {
      const candidates = [
        path.join(homeDir, "Documents", "My Games", "Wesnoth1.18", "preferences"),
        path.join(homeDir, "Documents", "My Games", "Wesnoth1.16", "preferences"),
        path.join(appDataDir, "Wesnoth1.18", "preferences"),
        path.join(appDataDir, "Wesnoth1.16", "preferences"),
      ];
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          if (/name="[^"]*"/i.test(txt)) {
            return txt.replace(/name="[^"]*"/i, `name="${name.replace(/"/g, "")}"`);
          }
          return txt ? `${txt}\nname="${name.replace(/"/g, "")}"` : `name="${name.replace(/"/g, "")}"\n`;
        });
      }
      return true;
    }

    // 19. C-Dogs SDL
    if (s === "c-dogs-sdl") {
      const cnfPath = path.join(appDataDir, "C-Dogs SDL", "options.cnf");
      await modifyConfigFile(cnfPath, (txt) => {
        let updated = updateIniSetting(txt, "Game", "PlayerName", name);
        return updateIniSetting(updated, "Game", "Server.ServerName", sName);
      });
      return true;
    }

    // 20. Widelands
    if (s === "widelands") {
      for (const base of [homeDir, appDataDir]) {
        const p = path.join(base, ".widelands", "config");
        await modifyConfigFile(p, (txt) => updateIniSetting(txt, "global", "nickname", name));
      }
      return true;
    }

    // 21. Warzone 2100
    if (s === "warzone-2100") {
      const candidates = [
        path.join(homeDir, "Documents", "Warzone 2100 4.x", "config"),
        path.join(appDataDir, "Warzone 2100 4.x", "config"),
      ];
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => {
          let updated = updateKeyValueSetting(txt, "playerName", name, { separator: " = " });
          return updateKeyValueSetting(updated, "gameName", sName, { separator: " = " });
        });
      }
      return true;
    }

    // 22. Red Eclipse
    if (s === "red-eclipse") {
      const candidates = [
        path.join(localAppDataDir, "redeclipse", "config.cfg"),
        gameDir ? path.join(gameDir, "config.cfg") : null,
      ].filter(Boolean);
      for (const p of candidates) {
        await modifyConfigFile(p, (txt) => updateKeyValueSetting(txt, "name", name, { quote: true, separator: " " }));
      }
      return true;
    }

    // 23. Managed RetroArch (netplay nickname across libretro games)
    if (userDataPath) {
      const raCfg = path.join(userDataPath, "runtimes", "retroarch", "retroarch.cfg");
      await modifyConfigFile(raCfg, (txt) => {
        let updated = updateKeyValueSetting(txt, "netplay_nickname", name, { quote: true, separator: " = " });
        return updateKeyValueSetting(updated, "netplay_mitm_server", sName, { quote: true, separator: " = " });
      });
    }

    return true;
  } catch (err) {
    console.warn(`[player-name] Auto-configuration failed for ${slug}:`, err?.message || err);
    return false;
  }
}

/**
 * Return command-line arguments to append for engines that accept username flags on launch.
 * Omits any flag already present in existingArgs.
 */
function getPlayerNameLaunchArgs(slug, playerName, existingArgs = []) {
  if (!slug || !playerName) return [];
  const name = sanitizePlayerName(playerName);
  const s = String(slug).toLowerCase();
  const argsStr = existingArgs.map(String).join(" ");

  // id Tech 3 / Quake 3 / Source Port cvars
  if (
    s === "openarena" ||
    s === "wolfenstein-enemy-territory" ||
    s === "medal-of-honor-allied-assault" ||
    s === "openmohaa" ||
    s === "unvanquished" ||
    s === "freedoom" ||
    s === "zandronum"
  ) {
    if (!/\+set\s+name|\bname\b/i.test(argsStr)) {
      return ["+set", "name", name];
    }
    return [];
  }

  // DarkPlaces engine
  if (s === "xonotic") {
    if (!/\+name|\b_cl_name\b/i.test(argsStr)) {
      return ["+name", name];
    }
    return [];
  }

  // Freeciv
  if (s === "freeciv") {
    if (!/--name\b/i.test(argsStr)) {
      return ["--name", name];
    }
    return [];
  }

  // Hedgewars
  if (s === "hedgewars") {
    if (!/--nick\b/i.test(argsStr)) {
      return ["--nick", name];
    }
    return [];
  }

  // Luanti / Minetest
  if (s === "luanti") {
    if (!/--name\b/i.test(argsStr)) {
      return ["--name", name];
    }
    return [];
  }

  // Space Station 14
  if (s === "space-station-14") {
    if (!/--username\b/i.test(argsStr)) {
      return ["--username", name];
    }
    return [];
  }

  // OpenTyrian / OpenTyrian 2000
  if (s === "opentyrian" || s === "opentyrian-2000") {
    if (!/--net-player-name\b/i.test(argsStr)) {
      return [`--net-player-name=${name}`];
    }
    return [];
  }

  // BZFlag
  if (s === "bzflag") {
    if (!/-callsign\b/i.test(argsStr)) {
      return ["-callsign", name];
    }
    return [];
  }

  // AssaultCube
  if (s === "assaultcube") {
    if (!/-n\S+|--name\b/i.test(argsStr)) {
      return [`-n${name}`];
    }
    return [];
  }

  // Red Eclipse
  if (s === "red-eclipse") {
    if (!/-n\S+|--name\b/i.test(argsStr)) {
      return [`-n${name}`];
    }
    return [];
  }

  // OpenRA family CLI fallback
  if (s === "openra" || s === "openhv" || s === "earth-2140-trilogy") {
    if (!/Player\.Name=/i.test(argsStr)) {
      return [`Player.Name=${name}`];
    }
    return [];
  }

  return [];
}

/**
 * Return non-duplicating engine-specific startup switches to set the server / session name.
 */
function getServerNameLaunchArgs(slug, serverName, existingArgs = []) {
  if (!slug) return [];
  const s = String(slug).toLowerCase().trim();
  const name = sanitizeServerName(serverName);
  const argsStr = existingArgs.join(" ");

  // id Tech 3 & Quake derivatives: OpenArena, Wolf ET, MOHAA, OpenMOHAA
  if (
    s === "openarena" ||
    s === "wolfenstein-enemy-territory" ||
    s === "medal-of-honor-allied-assault" ||
    s === "openmohaa"
  ) {
    if (!/sv_hostname\b/i.test(argsStr)) {
      return ["+set", "sv_hostname", name];
    }
    return [];
  }

  // DarkPlaces: Xonotic
  if (s === "xonotic") {
    if (!/\+hostname\b/i.test(argsStr)) {
      return ["+hostname", name];
    }
    return [];
  }

  // Unvanquished
  if (s === "unvanquished") {
    if (!/sv_hostname\b/i.test(argsStr)) {
      return ["+set", "sv_hostname", name];
    }
    return [];
  }

  // OpenRA family
  if (s === "openra" || s === "openhv" || s === "earth-2140-trilogy") {
    if (!/Server\.Name=/i.test(argsStr)) {
      return [`Server.Name=${name}`];
    }
    return [];
  }

  // Freeciv
  if (s === "freeciv") {
    if (!/--ServerName\b/i.test(argsStr)) {
      return ["--ServerName", name];
    }
    return [];
  }

  // AssaultCube
  if (s === "assaultcube") {
    if (!/-n\S+/i.test(argsStr) && /-f\d+/i.test(argsStr)) {
      return [`-n${name}`];
    }
    return [];
  }

  // 0 A.D.
  if (s === "0ad" || s === "0-ad") {
    if (!/-autostart-matchname=/i.test(argsStr) && /-autostart/i.test(argsStr)) {
      return [`-autostart-matchname=${name}`];
    }
    return [];
  }

  return [];
}

module.exports = {
  defaultServerName,
  sanitizePlayerName,
  sanitizeServerName,
  updateIniSetting,
  updateYamlProperty,
  updateCvarSetting,
  updateKeyValueSetting,
  modifyConfigFile,
  autoConfigureGamePlayerName,
  getPlayerNameLaunchArgs,
  getServerNameLaunchArgs,
};
