/**
 * RetroArch Netplay Game Registry.
 *
 * A declarative list of ROM-based games that support online multiplayer through
 * RetroArch's built-in netplay, tunneled over PlayBound Connect's virtual LAN.
 *
 * Adding a game is one entry in this file plus a matching multiplayer adapter
 * and connect-args line.  See docs/retroarch-netplay-games.md for the full
 * checklist.
 *
 * How it works:
 *   1. The host launches RetroArch with `-H` (host netplay).
 *   2. Joiners launch with `-C {host}` (connect to netplay host).
 *   3. Both are on the same PlayBound Connect overlay, so the host is
 *      directly addressable — no port forwarding needed.
 *   4. RetroArch syncs controller inputs frame-by-frame over TCP 55435.
 *
 * This is the same mechanism Mr. Boom already uses (see mrboom adapter in
 * adapters.ts), generalised to any ROM game.
 */

/**
 * Default RetroArch netplay port.
 * https://docs.libretro.com/guides/netplay-faq/
 */
const NETPLAY_PORT = 55435;

/**
 * Each entry describes one ROM-based game available for netplay.
 *
 * @property {string} slug         - PlayBound catalog slug.
 * @property {string} title        - Display name.
 * @property {string} core         - RetroArch core (must be in ManagedRetroArch CORES).
 * @property {string} [romFile]    - ROM filename within the install folder. Optional when
 *                                   the launcher resolves ROMs by extension.
 * @property {number} maxPlayers   - Maximum simultaneous netplay participants.
 * @property {number} netplayPort  - TCP port for netplay (default 55435).
 * @property {string} controllerType - Controller profile hint: "gamepad" or "arcade".
 * @property {string} source       - Where the player gets the ROM: "gog", "own", etc.
 * @property {string} [notes]      - Human-readable context.
 */
const RETROARCH_NETPLAY_GAMES = {
  "baseball-stars": {
    slug: "baseball-stars",
    title: "Baseball Stars",
    core: "fbneo",
    romFile: "bstars.zip",
    maxPlayers: 2,
    netplayPort: NETPLAY_PORT,
    controllerType: "gamepad",
    source: "gog",
    notes:
      "Neo Geo MVS. GOG supplies the ROM. 2-player head-to-head via RetroArch netplay.",
  },
  "baseball-stars-2": {
    slug: "baseball-stars-2",
    title: "Baseball Stars 2",
    core: "fbneo",
    romFile: "bstars2.zip",
    maxPlayers: 2,
    netplayPort: NETPLAY_PORT,
    controllerType: "gamepad",
    source: "gog",
    notes:
      "Neo Geo MVS. GOG supplies the ROM. 2-player head-to-head via RetroArch netplay.",
  },
  "super-sidekicks": {
    slug: "super-sidekicks",
    title: "Super Sidekicks",
    core: "fbneo",
    romFile: "ssideki.zip",
    maxPlayers: 2,
    netplayPort: NETPLAY_PORT,
    controllerType: "gamepad",
    source: "gog",
    notes:
      "Neo Geo MVS. GOG supplies the ROM. 2-player head-to-head via RetroArch netplay.",
  },
  "soccer-brawl": {
    slug: "soccer-brawl",
    title: "Soccer Brawl",
    core: "fbneo",
    romFile: "socbrawl.zip",
    maxPlayers: 2,
    netplayPort: NETPLAY_PORT,
    controllerType: "gamepad",
    source: "gog",
    notes:
      "Neo Geo MVS. GOG supplies the ROM. 2-player head-to-head via RetroArch netplay.",
  },

  /*
   * ── Add more games below ──────────────────────────────────────────────
   *
   * Copy this template and fill in the fields:
   *
   *   "your-game-slug": {
   *     slug: "your-game-slug",
   *     title: "Your Game Title",
   *     core: "fbneo",           // or "fceumm", "snes9x", "genesis_plus_gx", etc.
   *     romFile: "romname.zip",  // ROM filename GOG / the owner provides
   *     maxPlayers: 2,
   *     netplayPort: NETPLAY_PORT,
   *     controllerType: "gamepad",
   *     source: "gog",
   *     notes: "...",
   *   },
   *
   * Then add a matching adapter in platform/src/lib/multiplayer/adapters.ts
   * and a connect-args line in launcher/services/connectArgs.js.
   * See docs/retroarch-netplay-games.md for the full walkthrough.
   */
};

/** Returns the netplay config for a game slug, or null. */
function getNetplayConfig(slug) {
  return RETROARCH_NETPLAY_GAMES[String(slug || "").toLowerCase()] || null;
}

/** Returns true if this game is a registered netplay ROM game. */
function isNetplayRomGame(slug) {
  return getNetplayConfig(slug) !== null;
}

/**
 * RetroArch CLI args for hosting a netplay session.
 * @param {{ corePath: string, romPath: string }} paths  - Resolved paths from ensureCore.
 * @returns {string[]}
 */
function netplayHostArgs({ corePath, romPath }) {
  return ["-L", corePath, romPath, "-f", "-H"];
}

/**
 * RetroArch CLI args for joining a netplay session.
 * @param {{ corePath: string, romPath: string, host: string }} params
 * @returns {string[]}
 */
function netplayJoinArgs({ corePath, romPath, host }) {
  return ["-L", corePath, romPath, "-f", "-C", host];
}

/** Returns all registered netplay games. */
function listNetplayGames() {
  return Object.values(RETROARCH_NETPLAY_GAMES);
}

module.exports = {
  NETPLAY_PORT,
  RETROARCH_NETPLAY_GAMES,
  getNetplayConfig,
  isNetplayRomGame,
  listNetplayGames,
  netplayHostArgs,
  netplayJoinArgs,
};
