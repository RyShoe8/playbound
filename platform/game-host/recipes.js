/**
 * How to spawn a dedicated process for each hostable game.
 * Keep slugs in sync with platform/src/lib/gameHost/catalog.ts.
 *
 * Each recipe:
 *   portStart / portEnd — exclusive range for this game
 *   binaries — first existing path wins
 *   args(port, ctx) — argv after the binary
 *   stdin — optional string written after spawn (Mindustry)
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyEtLegacyReady } from "./etLegacyInstall.js";

const execFileAsync = promisify(execFile);

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
const HOST_ROOT = path.dirname(GAMES_ROOT);
const HOST_HOME = process.env.HOME || "/var/lib/playbound-host";
const ET_HOME_ROOT = process.env.GAME_HOST_ET_HOME || "/var/lib/playbound-host/et";
const WZ_CONFIG_DIR = path.join(HOST_HOME, "warzone");
const WZ_AUTOHOST_DIR = path.join(WZ_CONFIG_DIR, "autohost");
const TEEWORLDS_CONFIG_DIR = path.join(HOST_HOME, "teeworlds");

function teeworldsConfigPath(ctx) {
  const party = String(ctx.partyId || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(-24);
  return path.join(TEEWORLDS_CONFIG_DIR, `pb-${party || "default"}.cfg`);
}

function teeworldsServerName(name) {
  return String(name || "PlayBound Teeworlds")
    // Console config is one command per line. Keep party names from becoming
    // command separators or control characters in that file.
    .replace(/[\x00-\x1f\x7f\";\\]+/g, " ")
    .trim()
    .slice(0, 40);
}

function warzoneAutohostId(ctx) {
  const raw = String(ctx.partyId || "default")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(-16);
  return raw ? `pb-${raw}` : "pb-default";
}

/**
 * Warzone's autohost settings, as PlayBound declares them.
 *
 * These were inline literals in the challenge object below, which meant the
 * party leader hosting the room could not reach any of them and no UI could
 * know they existed. They are declared again, with labels and bounds, in
 * platform/src/lib/serverControl/settings.ts — the agent is a separate
 * deployable and cannot import the platform's TypeScript — and that file's
 * test reads this object out of this source to prove the two have not
 * drifted. Change one, change the other, or that test fails.
 *
 * Values only. `name` comes from the party, and `spectatorHost`, `blindMode`
 * and the `locked` block are not settings anyone is being offered.
 */
export const WARZONE_DEFAULT_SETTINGS = {
  map: "Sk-Mountain",
  maxPlayers: 8,
  techLevel: 1,
  bases: 2,
  powerLevel: 1,
  alliances: 0,
  scavengers: 0,
  openSpectatorSlots: 4,
};

/**
 * Enemy Territory's settings that can only be delivered at spawn.
 *
 * `sv_maxclients` is latched in the Quake 3 engine — rcon accepts a new value
 * and the running server ignores it until it restarts — so it is the one ET
 * setting that has to come through here rather than over the live channel.
 * Everything else ET declares is an rcon cvar and never touches this file.
 *
 * There is deliberately no default: absent means "do not pass the argument",
 * which is what keeps an untouched room byte-identical to what shipped.
 */
const ET_STARTUP_SETTING_KEYS = ["sv_maxclients"];

function etStartupSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== "object") return out;
  for (const key of ET_STARTUP_SETTING_KEYS) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/** Games with spawn-time defaults of their own. */
const RECIPE_DEFAULT_SETTINGS = {
  "warzone-2100": WARZONE_DEFAULT_SETTINGS,
};

function typesOf(values) {
  const types = {};
  for (const [key, value] of Object.entries(values)) types[key] = typeof value;
  return types;
}

/**
 * The spawn-time settings each recipe understands, and the type each must be.
 *
 * Only settings a room is *started* with belong here. ET's map and game mode
 * are delivered over rcon to a running server and never reach this file, which
 * is why its list is one key long despite the game declaring five settings.
 */
const RECIPE_SETTING_TYPES = {
  "warzone-2100": typesOf(WARZONE_DEFAULT_SETTINGS),
  "wolfenstein-enemy-territory": { sv_maxclients: "number" },
  openarena: { sv_maxclients: "number" },
  supertuxkart: { mode: "number", difficulty: "number", "max-players": "number" },
  "space-station-14": { "game.soft_max_players": "number", "game.lobbyenabled": "boolean" },
  freedoom: {
    gameMode: "string",
    sv_maxplayers: "number",
    sv_maxclients: "number",
    fraglimit: "number",
    timelimit: "number",
  },
};

/**
 * The settings a recipe will actually honour, filtered to the keys it declares.
 *
 * PlayBound validates a host's choices against the game's schema before they
 * get here (`coerceSettingValues`), but this agent is reachable by anything
 * holding the shared secret and these values are written into a file a game
 * server parses. So the recipe's own keys are the boundary here too: an
 * undeclared key is dropped rather than passed through, and a value of the
 * wrong type is ignored rather than written out to break the spawn.
 */
export function acceptedSettingsFor(slug, settings) {
  const types = RECIPE_SETTING_TYPES[slug];
  if (!types || !settings || typeof settings !== "object") return {};
  const accepted = {};
  for (const [key, expected] of Object.entries(types)) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== expected) continue;
    accepted[key] = value;
  }
  return accepted;
}

/** A recipe's defaults with any accepted host overrides applied. */
export function effectiveSettings(slug, settings) {
  const defaults = RECIPE_DEFAULT_SETTINGS[slug];
  if (!defaults) return {};
  return { ...defaults, ...acceptedSettingsFor(slug, settings) };
}

/**
 * OpenArena settings that can only be delivered at spawn.
 *
 * sv_maxclients is latched in the Quake 3 engine — rcon takes the value and the
 * running server keeps the old one — so it is the one OpenArena setting that
 * cannot go over the live channel. Absent means the argument is not passed at
 * all, which keeps an untouched room identical to what shipped.
 */
function openArenaStartupArgs(settings) {
  const value = settings && typeof settings === "object" ? settings.sv_maxclients : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return [];
  return ["+set", "sv_maxclients", String(value)];
}

/**
 * Freedoom's multiplayer server is Zandronum, and its cvars go on the command
 * line as `+name value` — the same form the recipe already uses for
 * `+sv_hostname`.
 *
 * Game mode is the awkward one. Zandronum has no single mode variable: each
 * mode is its own boolean (`ctf 1`, `teamplay 1`, …) and cooperative is the
 * absence of all of them. PlayBound's schema declares one enum, because that is
 * what a host is actually choosing, and the spelling is this function's job.
 *
 * Chocolate Doom understands none of this, so its branch below never calls in
 * here and keeps the plain args it always had.
 */
const ZANDRONUM_MODE_CVARS = {
  deathmatch: "deathmatch",
  teamplay: "teamplay",
  ctf: "ctf",
  duel: "duel",
  lastmanstanding: "lastmanstanding",
};

function freedoomSettingArgs(settings) {
  if (!settings || typeof settings !== "object") return [];
  const args = [];
  const mode = ZANDRONUM_MODE_CVARS[settings.gameMode];
  // "coop" is the absence of a mode flag, not a flag of its own.
  if (mode) args.push(`+${mode}`, "1");
  for (const key of ["sv_maxplayers", "sv_maxclients", "fraglimit", "timelimit"]) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) args.push(`+${key}`, String(value));
  }
  return args;
}

/**
 * Settings that go on a command line as their own flags.
 *
 * SuperTuxKart and Space Station 14 both take theirs this way rather than
 * through a config file, so a recipe only has to append what a host chose. An
 * unset value is left off entirely rather than pinned to whatever number this
 * file believes the default is — a room nobody has touched starts exactly as
 * it always did.
 */
function flagArgs(settings, spec) {
  const args = [];
  if (!settings || typeof settings !== "object") return args;
  for (const [key, format] of Object.entries(spec)) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === "boolean" ? String(value) : String(value);
    args.push(...format(text));
  }
  return args;
}

function buildWarzoneAutohostConfig(ctx) {
  const settings = effectiveSettings("warzone-2100", ctx.settings);
  return {
    locked: {
      alliances: true,
      scavengers: true,
      bases: true,
    },
    challenge: {
      map: settings.map,
      maxPlayers: settings.maxPlayers,
      scavengers: settings.scavengers,
      alliances: settings.alliances,
      powerLevel: settings.powerLevel,
      bases: settings.bases,
      name: String(ctx.name || "PlayBound.club Party").slice(0, 40),
      techLevel: settings.techLevel,
      spectatorHost: true,
      openSpectatorSlots: settings.openSpectatorSlots,
      blindMode: "none",
    },
  };
}

function firstExisting(candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function gameBin(slug, names) {
  const dir = path.join(GAMES_ROOT, slug);
  return [
    path.join(dir, "run-server"),
    ...names.map((n) => path.join(dir, n)),
    ...names.map((n) => `/usr/lib/${slug}/bin/${n}`),
    ...names.map((n) => `/usr/lib/hedgewars/bin/${n}`),
    ...names.map((n) => `/usr/games/${n}`),
    ...names.map((n) => `/usr/bin/${n}`),
    ...names.map((n) => `/usr/local/bin/${n}`),
  ];
}

function openRaMod(editionSlug) {
  const raw = String(editionSlug || "").toLowerCase();
  if (raw.includes("cnc") || raw.includes("tiberian") || raw === "td") return "cnc";
  if (raw.includes("d2k") || raw.includes("dune")) return "d2k";
  if (raw.includes("combined") || raw.includes("ca")) return "ca";
  if (raw.includes("openhv") || raw === "hv") return "hv";
  if (raw.includes("ra2")) return "ra2";
  return "ra";
}

export const recipes = {
  teeworlds: {
    portStart: 8303,
    portEnd: 8323,
    protocol: "udp",
    binaries: gameBin("teeworlds", ["teeworlds_srv"]),
    args: (_port, ctx) => ["-f", teeworldsConfigPath(ctx)],
    prepareSpawn: async (port, ctx) => {
      fs.mkdirSync(TEEWORLDS_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(
        teeworldsConfigPath(ctx),
        [
          `sv_name ${teeworldsServerName(ctx.name)}`,
          `sv_port ${port}`,
          "sv_register 0",
          "sv_map dm1",
          "sv_gametype dm",
          "sv_max_clients 16",
          "sv_spectator_slots 0",
          "sv_scorelimit 20",
          "sv_timelimit 10",
          "sv_motd Private PlayBound party server",
          "",
        ].join("\n")
      );
    },
  },
  openra: {
    portStart: 1234,
    portEnd: 1250,
    protocol: "tcp",
    binaries: [
      ...gameBin("openra", ["OpenRA.Server", "openra-server"]),
      ...gameBin("combined-arms", ["OpenRA.Server", "openra-server"]),
      ...gameBin("openhv", ["OpenHV.Server", "openhv-server", "OpenRA.Server"]),
    ],
    resolveBinary: (candidates, ctx) => {
      const ed = String(ctx?.editionSlug || "").toLowerCase();
      if (ed.includes("combined") || ed === "ca") {
        const caBin = firstExisting(gameBin("combined-arms", ["OpenRA.Server", "openra-server"]));
        if (caBin) return caBin;
      }
      if (ed.includes("openhv") || ed === "hv") {
        const hvBin = firstExisting(gameBin("openhv", ["OpenHV.Server", "openhv-server", "OpenRA.Server"]));
        if (hvBin) return hvBin;
      }
      return firstExisting(candidates);
    },
    args: (port, ctx) => [
      // ctx.mod is an explicit override for the "official" edition, which is
      // one client covering ra/cnc/d2k — editionSlug alone can't say which.
      `Game.Mod=${ctx.mod || openRaMod(ctx.editionSlug)}`,
      `Server.Name=${ctx.name}`,
      `Server.ListenPort=${port}`,
      "Server.AdvertiseOnline=False",
      "Server.EnableSingleplayer=False",
    ],
  },
  openttd: {
    portStart: 3979,
    portEnd: 3999,
    protocol: "both",
    binaries: gameBin("openttd", ["openttd"]),
    args: (port) => ["-D", `0.0.0.0:${port}`],
    startupGraceMs: 1500,
    spawnEnv: () => ({
      HOME: HOST_HOME,
      XDG_DATA_HOME: HOST_HOME,
    }),
  },
  luanti: {
    portStart: 30000,
    portEnd: 30020,
    protocol: "udp",
    binaries: gameBin("luanti", ["luantiserver", "minetestserver"]),
    args: (port, ctx) => {
      const world = path.join(HOST_HOME, "luanti-worlds", `pb-${ctx.partyId.slice(-8)}`);
      return [
        "--port",
        String(port),
        "--world",
        world,
        "--gameid",
        "minetest",
        "--logfile",
        path.join(HOST_HOME, "logs", "minetest.log"),
      ];
    },
    prepareSpawn: async (port, ctx) => {
      fs.mkdirSync(path.join(HOST_HOME, "logs"), { recursive: true });
      fs.mkdirSync(path.join(HOST_HOME, "luanti-worlds", `pb-${ctx.partyId.slice(-8)}`), {
        recursive: true,
      });
      /*
       * Ubuntu's minetest-server / luanti-server packages enable a systemd unit
       * that owns UDP 30000 by default. Our in-memory port map cannot see that,
       * so free the chosen port (and common orphans) before spawn.
       */
      try {
        await execFileAsync("fuser", ["-k", `${port}/udp`, `${port}/tcp`]);
      } catch {
        /* port was free */
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    },
    spawnEnv: () => ({ HOME: HOST_HOME }),
  },
  /*
   * Hurry Curry! — WebSocket/JSON over TCP.
   *
   * `--listen` takes a full SocketAddr and defaults to [::]:27032; binding
   * [::] covers v4 and v6. Deliberately NOT passing --register: a PlayBound
   * party room is private to that party, and announcing every ephemeral room
   * to the public registry at registry.hurrycurry.org would spam a
   * community list with rooms nobody outside the party can use.
   */
  "hurry-curry": {
    portStart: 27032,
    portEnd: 27052,
    protocol: "tcp",
    binaries: gameBin("hurry-curry", ["hurrycurry-server"]),
    args: (port, ctx) => [
      "--listen",
      `[::]:${port}`,
      "--name",
      String(ctx.name || "PlayBound Hurry Curry").slice(0, 40),
    ],
    spawnEnv: () => ({ HOME: HOST_HOME }),
  },
  mindustry: {
    portStart: 6567,
    portEnd: 6587,
    protocol: "both",
    binaries: [
      ...gameBin("mindustry", ["run-server"]),
      "/usr/bin/java",
    ],
    args: (port, ctx) => {
      const jar = firstExisting([
        path.join(GAMES_ROOT, "mindustry", "server-release.jar"),
        path.join(GAMES_ROOT, "mindustry", "Mindustry.jar"),
      ]);
      if (jar) return ["-jar", jar];
      return [];
    },
    resolveBinary: (candidates) => {
      const jar = firstExisting([
        path.join(GAMES_ROOT, "mindustry", "server-release.jar"),
        path.join(GAMES_ROOT, "mindustry", "Mindustry.jar"),
      ]);
      const wrapper = firstExisting(gameBin("mindustry", ["run-server"]));
      if (wrapper) return wrapper;
      if (jar && fs.existsSync("/usr/bin/java")) return "/usr/bin/java";
      return firstExisting(candidates);
    },
    stdin: (port, ctx) => `config name ${ctx.name}\nconfig port ${port}\nhost\n`,
  },
  ysoccer: {
    portStart: 54555,
    portEnd: 54575,
    protocol: "both",
    binaries: [
      path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar"),
      "/usr/bin/java",
    ],
    resolveBinary: () => {
      const jar = path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar");
      if (fs.existsSync(jar) && fs.existsSync("/usr/bin/java")) return "/usr/bin/java";
      return null;
    },
    args: (port) => [
      "-jar",
      path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar"),
      String(port),
      String(port),
    ],
  },
  hedgewars: {
    portStart: 46631,
    portEnd: 46650,
    protocol: "both",
    binaries: gameBin("hedgewars", ["hedgewars-server"]),
    args: (port) => ["-p", String(port)],
  },
  "warzone-2100": {
    portStart: 2100,
    portEnd: 2120,
    protocol: "both",
    binaries: gameBin("warzone-2100", ["run-server", "warzone2100"]),
    resolveBinary: () =>
      firstExisting([
        path.join(GAMES_ROOT, "warzone-2100", "run-server"),
        "/usr/games/warzone2100.real",
        "/usr/lib/warzone2100/warzone2100.real",
        "/usr/lib/x86_64-linux-gnu/warzone2100/warzone2100.real",
        "/usr/lib/warzone2100/warzone2100",
        "/usr/lib/x86_64-linux-gnu/warzone2100/warzone2100",
        ...gameBin("warzone-2100", ["warzone2100"]),
      ]),
    prepareSpawn: async (_port, ctx) => {
      fs.mkdirSync(WZ_AUTOHOST_DIR, { recursive: true });
      const autohostId = warzoneAutohostId(ctx);
      fs.writeFileSync(
        path.join(WZ_AUTOHOST_DIR, `${autohostId}.json`),
        JSON.stringify(buildWarzoneAutohostConfig(ctx), null, 2)
      );
    },
    args: (port, ctx) => [
      `--configdir=${WZ_CONFIG_DIR}`,
      `--autohost=${warzoneAutohostId(ctx)}`,
      `--gameport=${port}`,
      "--startplayers=1",
      "--headless",
      "--nosound",
    ],
    startupGraceMs: 2500,
    spawnEnv: () => ({ HOME: HOST_HOME }),
  },
  freeciv: {
    portStart: 5556,
    portEnd: 5576,
    protocol: "tcp",
    binaries: gameBin("freeciv", ["freeciv-server"]),
    args: (port) => ["-p", String(port)],
  },
  bzflag: {
    // Ubuntu's bzflag-server unit commonly owns/restarts on the default 5154.
    // PlayBound rooms use the adjacent range instead of racing that service.
    portStart: 5155,
    portEnd: 5174,
    protocol: "both",
    binaries: gameBin("bzflag", ["bzfs"]),
    // With no -world/-c/-cr, BZFS generates a random FFA world. Keep this
    // ephemeral room private and enable the familiar jump/ricochet rules.
    args: (port) => ["-p", String(port), "-offa", "-q", "-j", "+r", "+s", "10", "-mp", "8"],
  },
  supertuxkart: {
    portStart: 2759,
    portEnd: 2779,
    protocol: "both",
    binaries: gameBin("supertuxkart", ["supertuxkart"]),
    args: (port, ctx) => [
      `--lan-server=${ctx.name}`,
      `--port=${port}`,
      "--no-graphics",
      ...flagArgs(acceptedSettingsFor("supertuxkart", ctx.settings), {
        mode: (v) => [`--mode=${v}`],
        difficulty: (v) => [`--difficulty=${v}`],
        "max-players": (v) => [`--max-players=${v}`],
      }),
    ],
  },
  xonotic: {
    portStart: 26000,
    portEnd: 26020,
    protocol: "udp",
    binaries: gameBin("xonotic", [
      "xonotic-linux64-dedicated",
      "xonotic-dedicated",
    ]),
    args: (port, ctx) => [
      "+port",
      String(port),
      "+hostname",
      ctx.name,
      "+sv_public",
      "0",
    ],
  },
  openarena: {
    // Quake 3 engine, same as ET: takes rcon on its own UDP port. index.js
    // generates a per-room password when a recipe declares this.
    rcon: "quake3",
    portStart: 27960,
    portEnd: 27980,
    protocol: "udp",
    binaries: gameBin("openarena", ["openarena-server"]),
    args: (port, ctx) => [
      "+set",
      "dedicated",
      "1",
      "+set",
      "net_port",
      String(port),
      "+set",
      "sv_hostname",
      ctx.name,
      "+set",
      "sv_master1",
      '""',
      ...(ctx.rconPassword ? ["+set", "rconpassword", ctx.rconPassword] : []),
      ...(openArenaStartupArgs(ctx.settings)),
    ],
  },
  triplea: {
    portStart: 3303,
    portEnd: 3323,
    protocol: "tcp",
    startupGraceMs: 5000,
    binaries: gameBin("triplea", ["run-server"]),
    resolveBinary: () => firstExisting([path.join(GAMES_ROOT, "triplea", "run-server")]),
    args: (port) => [String(port)],
    cwd: () => path.join(GAMES_ROOT, "triplea"),
    prepareSpawn: async () => {
      fs.mkdirSync(path.join(GAMES_ROOT, "triplea", "downloadedMaps"), { recursive: true });
    },
    spawnEnv: (port) => ({
      BOT_COMMENT: "automated_host",
      BOT_NAME: `Bot_PB_${port}`,
      BOT_PORT: String(port),
      BOT_LOBBY_URI: "https://prod2-lobby.triplea-game.org",
      MAPS_FOLDER: path.join(GAMES_ROOT, "triplea", "downloadedMaps"),
    }),
  },
  "0-ad": {
    portStart: 20595,
    // Pyrogenesis exposes no supported CLI override for its host port.
    portEnd: 20595,
    protocol: "udp",
    binaries: gameBin("0-ad", ["pyrogenesis", "0ad"]),
    args: (_port, ctx) => [
      "-autostart=random/mainland",
      "-autostart-host",
      `-autostart-host-players=${Math.max(2, Math.min(Number(ctx.maxPlayers) || 8, 8))}`,
      "-autostart-playername=PlayBound Server",
      "-autostart-seed=-1",
      "-autostart-nonvisual",
      "-quickstart",
      "-nosound",
    ],
    startupReadyTimeoutMs: 30_000,
  },
  bombsquad: {
    portStart: 43210,
    portEnd: 43230,
    protocol: "udp",
    binaries: gameBin("bombsquad", ["bombsquad_server"]),
    args: (port, ctx) => [
      String(port),
      ctx.name,
      String(Math.min(Number(ctx.maxPlayers) || 8, 8)),
      ctx.partyId,
    ],
  },
  "wolfenstein-enemy-territory": {
    portStart: 27950,
    portEnd: 27959,
    protocol: "udp",
    startupGraceMs: 3000,
    // Quake 3 engine: takes rcon on its own UDP port. index.js generates a
    // per-room password and passes it in ctx for the args below.
    rcon: "quake3",
    binaries: gameBin("wolfenstein-enemy-territory", [
      "etlded",
      "etlded.x86_64",
      "etl.x86_64.ded",
    ]),
    args: (port, ctx) => {
      const gameDir = path.join(GAMES_ROOT, "wolfenstein-enemy-territory");
      const homePath = path.join(ET_HOME_ROOT, ctx.partyId.slice(-16) || "default");
      return [
        "+set",
        "fs_basepath",
        gameDir,
        "+set",
        "fs_homepath",
        homePath,
        "+set",
        "dedicated",
        "2",
        "+set",
        "net_port",
        String(port),
        "+set",
        "sv_hostname",
        ctx.name,
        "+set",
        "sv_master1",
        '""',
        "+set",
        "sv_pure",
        "0",
        "+set",
        "omnibot_enable",
        "0",
        /*
         * Only what the host actually chose. An unset value is left to the
         * engine rather than pinned to whatever number this file believes the
         * default is — a room nobody has touched still starts exactly as it
         * always did.
         */
        ...(ctx.rconPassword ? ["+set", "rconpassword", ctx.rconPassword] : []),
        ...(etStartupSettings(ctx.settings).sv_maxclients !== undefined
          ? ["+set", "sv_maxclients", String(etStartupSettings(ctx.settings).sv_maxclients)]
          : []),
        "+exec",
        "et-playbound.cfg",
        "+map",
        "oasis",
      ];
    },
    prepareSpawn: async (_port, ctx) => {
      const homePath = path.join(ET_HOME_ROOT, ctx.partyId.slice(-16) || "default");
      fs.mkdirSync(ET_HOME_ROOT, { recursive: true });
      fs.mkdirSync(homePath, { recursive: true });
    },
  },
  "team-fortress-2": {
    portStart: 27015,
    portEnd: 27025,
    protocol: "udp",
    binaries: gameBin("team-fortress-2", ["srcds_run", "srcds_linux", "srcds"]),
    args: (port, ctx) => [
      "-game",
      "tf",
      "-dedicated",
      "+map",
      "ctf_2fort",
      "+maxplayers",
      "24",
      "+port",
      String(port),
      "+hostname",
      ctx.name || "PlayBound.club Party",
    ],
  },
  "counter-strike-2": {
    portStart: 27030,
    portEnd: 27040,
    protocol: "udp",
    binaries: gameBin("counter-strike-2", ["cs2.sh", "cs2", "srcds_run", "srcds_linux"]),
    args: (port, ctx) => [
      "-dedicated",
      "+map",
      "de_dust2",
      "-port",
      String(port),
      "+maxplayers",
      "16",
      "+hostname",
      ctx.name || "PlayBound.club Party",
    ],
  },
  unvanquished: {
    portStart: 27965,
    portEnd: 27975,
    protocol: "udp",
    binaries: gameBin("unvanquished", ["daemonded", "daemon-ded", "unvanquished-server"]),
    args: (port, ctx) => [
      "+set",
      "net_port",
      String(port),
      "+set",
      "sv_hostname",
      ctx.name || "PlayBound.club Party",
      "+map",
      "plat23",
    ],
  },
  "battle-for-wesnoth": {
    portStart: 15000,
    portEnd: 15020,
    protocol: "tcp",
    binaries: gameBin("battle-for-wesnoth", [
      "wesnothd",
      "wesnoth-server",
      "wesnothd-1.18",
      "wesnothd-1.16",
      "wesnoth",
    ]),
    args: (port, _ctx, binary) => {
      // If the GUI client binary is symlinked, pass -s to run in dedicated server mode
      if (binary && (binary.endsWith("/wesnoth") || binary === "wesnoth")) {
        return ["-s", "-p", String(port)];
      }
      return ["-p", String(port)];
    },
  },
  veloren: {
    portStart: 14004,
    portEnd: 14014,
    protocol: "both",
    binaries: gameBin("veloren", ["veloren-server-cli", "veloren-server"]),
    args: () => [],
    cwd: () => path.join(GAMES_ROOT, "veloren"),
    spawnEnv: () => ({
      SDL_VIDEODRIVER: "dummy",
      SDL_AUDIODRIVER: "dummy",
      VELOREN_ASSETS: path.join(GAMES_ROOT, "veloren", "assets"),
    }),
  },
  freedoom: {
    portStart: 10666,
    portEnd: 10686,
    protocol: "udp",
    binaries: gameBin("freedoom", [
      "odasrv",
      "odamex-server",
      "zandronum-server",
      "chocolate-server",
      "chocolate-doom-server",
      "crispy-server",
      "prboom-plus-game-server",
    ]),
    spawnEnv: () => ({ SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" }),
    args: (port, ctx, binary) => {
      const isChoc = binary && binary.toLowerCase().includes("chocolate");
      const iwadArgs = [];
      const ed = String(ctx?.editionSlug || "").toLowerCase();
      if (ed.includes("phase-1") || ed.includes("phase1") || ed === "1") {
        iwadArgs.push("-iwad", "freedoom1.wad");
      } else if (ed.includes("phase-2") || ed.includes("phase2") || ed === "2") {
        iwadArgs.push("-iwad", "freedoom2.wad");
      }
      if (isChoc) {
        return ["-port", String(port), "-servername", ctx.name || "PlayBound.club Party", ...iwadArgs];
      }
      return [
        "-port",
        String(port),
        "+sv_hostname",
        ctx.name || "PlayBound.club Party",
        ...iwadArgs,
        ...freedoomSettingArgs(ctx.settings),
      ];
    },
  },
  "space-station-14": {
    portStart: 1212,
    portEnd: 1222,
    protocol: "udp",
    binaries: gameBin("space-station-14", ["Robust.Server", "SS14.Server"]),
    // RobustToolbox takes any CVar as --cvar name=value, overriding both its
    // defaults and the config file, so nothing has to be written to disk.
    args: (port, ctx) => [
      "--port",
      String(port),
      ...flagArgs(acceptedSettingsFor("space-station-14", ctx && ctx.settings), {
        "game.soft_max_players": (v) => ["--cvar", `game.soft_max_players=${v}`],
        "game.lobbyenabled": (v) => ["--cvar", `game.lobbyenabled=${v}`],
      }),
    ],
  },
  "zero-k": {
    portStart: 8452,
    portEnd: 8462,
    protocol: "udp",
    binaries: gameBin("zero-k", ["spring-dedicated", "spring", "Zero-K.exe"]),
    args: (port) => ["--port", String(port), "--headless"],
  },
  flightgear: {
    portStart: 5000,
    portEnd: 5010,
    protocol: "udp",
    binaries: gameBin("flightgear", ["fgms", "fgfs", "flightgear"]),
    args: (port) => ["-p", String(port)],
  },
  openhv: {
    portStart: 1255,
    portEnd: 1270,
    protocol: "tcp",
    binaries: gameBin("openhv", ["OpenHV.Server", "openhv-server", "OpenRA.Server"]),
    args: (port, ctx) => [
      "Game.Mod=hv",
      `Server.Name=${ctx.name || "PlayBound.club Party"}`,
      `Server.ListenPort=${port}`,
      "Server.AdvertiseOnline=False",
    ],
  },
  "re-volt-rvgl": {
    portStart: 2310,
    portEnd: 2330,
    protocol: "udp",
    binaries: gameBin("re-volt-rvgl", ["rvgl.64", "rvgl.32", "rvgl", "rvgl.exe", "rvgl-server"]),
    resolveBinary: (candidates) => {
      const realBin = firstExisting(candidates);
      if (!realBin) return null;
      if (fs.existsSync("/usr/bin/xvfb-run")) return "/usr/bin/xvfb-run";
      return realBin;
    },
    args: (port, ctx, binary) => {
      const realBin = firstExisting(gameBin("re-volt-rvgl", ["rvgl.64", "rvgl.32", "rvgl", "rvgl.exe", "rvgl-server"]));
      const baseArgs = [
        "-dedicated",
        "-lobby",
        "-port",
        String(port),
        "-name",
        ctx.name || "PlayBound.club Party",
        "-nosound",
      ];
      if (binary && binary.endsWith("xvfb-run") && realBin) {
        return ["-a", realBin, ...baseArgs];
      }
      return baseArgs;
    },
    cwd: () => path.join(GAMES_ROOT, "re-volt-rvgl"),
    spawnEnv: () => ({ ALSOFT_DRIVERS: "null", SDL_AUDIODRIVER: "dummy" }),
  },
};

export function resolveRecipe(slug, ctx) {
  const recipe = recipes[slug];
  if (!recipe) return null;
  const binary = recipe.resolveBinary
    ? recipe.resolveBinary(recipe.binaries, ctx)
    : firstExisting(recipe.binaries);
  return { recipe, binary };
}

const HOST_TITLES = {
  "0-ad": "0 A.D.",
  bombsquad: "BombSquad",
  "wolfenstein-enemy-territory": "Wolfenstein: Enemy Territory",
  ysoccer: "YSoccer",
};

/**
 * VPS dedicated binary is missing — not the party leader's local install.
 * health.games lists which recipes resolved a binary on this box.
 */
export function missingDedicatedBinaryMessage(slug, recipe) {
  const title = HOST_TITLES[slug] || slug;
  const names = [
    ...new Set(
      (recipe?.binaries || [])
        .map((p) => path.basename(String(p || "")))
        .filter(Boolean)
    ),
  ];
  const ops = names.length
    ? ` The VPS is missing ${names.join(" or ")} — check health.games.`
    : "";
  return `PlayBound's game server does not have ${title} yet.${ops}`;
}

export function listInstalled() {
  const out = {};
  for (const slug of Object.keys(recipes)) {
    const { binary } = resolveRecipe(slug);
    out[slug] = Boolean(binary);
  }
  return out;
}

/** Binary presence plus verified-ready state (ET needs pak0 in etmain). */
export function listGameHostStatus() {
  const out = {};
  for (const slug of Object.keys(recipes)) {
    const { binary } = resolveRecipe(slug);
    const hasBinary = Boolean(binary);
    let ready = hasBinary;
    if (slug === "wolfenstein-enemy-territory" && hasBinary) {
      const gameDir = path.join(GAMES_ROOT, slug);
      const check = verifyEtLegacyReady(gameDir);
      ready = check.ok;
    }
    if (slug === "triplea" && hasBinary) {
      const runServer = path.join(GAMES_ROOT, "triplea", "run-server");
      const java25 = path.join(HOST_ROOT, "jre", "temurin-25", "bin", "java");
      ready = fs.existsSync(runServer) && fs.existsSync(java25);
    }
    if (slug === "openttd" && hasBinary) {
      const baseset = path.join(HOST_HOME, ".openttd", "baseset");
      try {
        ready =
          fs.existsSync(baseset) &&
          fs.readdirSync(baseset).some((f) => f.endsWith(".grf"));
      } catch {
        ready = false;
      }
    }
    out[slug] = { installed: hasBinary, ready };
  }
  return out;
}
