/**
 * Server recipes for games offered on the paid Dedicated plan.
 *
 * Kept apart from recipes.js for the paid hosting recipe set. Published games
 * with VPS-ready files can also be selected for Community Hosting by an admin;
 * they are never enrolled in rotation automatically. The slot cap is the one
 * thing every recipe must get right, so each one applies
 * `managedPlayerLimit(ctx)` through the
 * mechanism the game's own server documents:
 *
 *   counter-strike-source  -maxplayers N            (LinuxGSM start parameters)
 *   terraria               -maxplayers N            (Terraria serverconfig.txt)
 *   unturned               Commands.dat  MaxPlayers
 *   core-keeper            ServerConfig.json  maxNumberPlayers
 *   vintage-story          serverconfig.json  MaxClients
 *   factorio               server-settings.json  max_players
 *   rimworld-together      Configs/ServerConfig.json  MaxPlayers (refuses joins when full,
 *                          Source/Server/Hooks/TCPNetwork/ServerNetwork.cs)
 *
 * Every server keeps its files in its own folder under the host's home, named
 * pb-<server id>, so one customer's world can never be another's.
 *
 * The launch parameters come from those upstream sources. See
 * docs/dedicated-game-servers.md for VPS smoke-test results and remaining
 * client-join checks.
 */
import { randomBytes } from "node:crypto";

/**
 * @param {{
 *   fs: typeof import("node:fs"),
 *   path: typeof import("node:path"),
 *   execFile: (file: string, args: string[], opts: object) => Promise<unknown>,
 *   GAMES_ROOT: string,
 *   HOST_HOME: string,
 *   gameBin: (slug: string, names: string[]) => string[],
 *   firstExisting: (paths: string[]) => string | null,
 *   managedPlayerLimit: (ctx: object, fallback?: number) => number,
 *   customerHomeDir: (dirName: string, ctx: object) => string,
 *   isolatedHomeEnv: (dirName: string) => (port: number, ctx: object) => Record<string, string>,
 * }} deps
 */
export function createDedicatedRecipes(deps) {
  const { fs, path, execFile, GAMES_ROOT, HOST_HOME, gameBin, firstExisting, managedPlayerLimit, customerHomeDir, isolatedHomeEnv } = deps;

  /** One folder per server: the customer's home, or a rooms folder for anything else. */
  function serverDir(dirName, ctx) {
    if (ctx.customerOwned) return customerHomeDir(dirName, ctx);
    const id = String(ctx.partyId || "room").replace(/[^a-zA-Z0-9_-]/g, "").slice(-24);
    const dir = path.join(HOST_HOME, `${dirName}-rooms`, `pb-${id}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  function serverId(ctx) {
    return String(ctx.partyId || "room").replace(/[^a-zA-Z0-9_-]/g, "").slice(-24);
  }

  /** A name safe to put on a command line or in a config value. */
  function serverName(ctx, fallback) {
    const cleaned = String(ctx.name || fallback).replace(/[\r\n"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
    return cleaned || fallback;
  }

  function xmlValue(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /** Merge values into a JSON config, keeping every key the game already wrote. */
  function mergeJsonConfig(file, values, { keepExisting = [] } = {}) {
    let current = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
    } catch {
      /* first start, or an unreadable file the game will rewrite */
    }
    const next = { ...current };
    for (const [key, value] of Object.entries(values)) {
      if (keepExisting.includes(key) && key in current) continue;
      next[key] = value;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  /** The console is read by these servers; a closed stdin can end them, so the pipe is kept open. */
  const keepStdinOpen = () => "";

  return {
    "battlefield-1942-anthology": {
      portStart: 14567,
      portEnd: 14586,
      protocol: "udp",
      binaries: gameBin("battlefield-1942-anthology", ["bf1942_lnxded.static", "bf1942_lnxded.dynamic"]),
      cwd: () => path.join(GAMES_ROOT, "battlefield-1942-anthology"),
      spawnEnv: isolatedHomeEnv("battlefield-1942-anthology-servers"),
      startupReadyTimeoutMs: 60_000,
      prepareSpawn: async (port, ctx) => {
        const root = path.join(GAMES_ROOT, "battlefield-1942-anthology");
        const source = path.join(root, "mods", "bf1942", "settings");
        if (!fs.existsSync(path.join(source, "serversettings.con")) ||
            !fs.existsSync(path.join(source, "maplist.con")) ||
            !fs.existsSync(path.join(root, "mods", "bf1942", "archives"))) {
          throw new Error("Battlefield 1942 dedicated server files are incomplete");
        }
        const overlay = serverDir("battlefield-1942-anthology-servers", ctx);
        const settings = path.join(overlay, "mods", "bf1942", "settings");
        if (!fs.existsSync(settings)) fs.cpSync(source, settings, { recursive: true });
        fs.mkdirSync(path.join(overlay, "logs"), { recursive: true, mode: 0o700 });
        const config = path.join(settings, "serversettings.con");
        const original = fs.readFileSync(config, "utf8");
        const values = {
          "game.serverName": `"${serverName(ctx, "PlayBound Dedicated")}"`,
          "game.serverDedicated": "1",
          // Direct-IP joins work without publishing to the defunct GameSpy master.
          "game.serverInternet": "0",
          "game.serverIP": "0.0.0.0",
          "game.serverPort": String(port),
          "game.serverMaxPlayers": String(Math.min(64, managedPlayerLimit(ctx))),
          "game.serverPassword": "\"\"",
          "game.gameSpyLANPort": "0",
          "game.gameSpyPort": "0",
          "game.ASEPort": "0",
          "game.serverPunkBuster": "0",
        };
        const lines = original.split(/\r?\n/).filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key} `)));
        fs.writeFileSync(config, `${lines.join("\n").trimEnd()}\n${Object.entries(values).map(([key, value]) => `${key} ${value}`).join("\n")}\n`, { mode: 0o600 });
      },
      args: (_port, ctx) => ["+overlayPath", serverDir("battlefield-1942-anthology-servers", ctx), "+statusMonitor", "1"],
    },
    "goldeneye-source": {
      portStart: 27120,
      portEnd: 27139,
      protocol: "udp",
      rcon: "source",
      binaries: gameBin("goldeneye-source", ["run-server.sh"]),
      resolveBinary: (candidates, ctx) => {
        if (ctx) {
          const runtime = path.join(serverDir("goldeneye-source-servers", ctx), "runtime", "run-server.sh");
          if (fs.existsSync(runtime)) return runtime;
        }
        return firstExisting(candidates);
      },
      cwd: (_port, ctx) => path.join(serverDir("goldeneye-source-servers", ctx), "runtime"),
      startupReadyTimeoutMs: 90_000,
      spawnEnv: (_port, ctx) => {
        const home = serverDir("goldeneye-source-servers", ctx);
        return { HOME: home, WINEPREFIX: path.join(home, "wineprefix"), WINEDEBUG: "-all" };
      },
      prepareSpawn: async (_port, ctx) => {
        const home = serverDir("goldeneye-source-servers", ctx);
        const runtime = path.join(home, "runtime");
        if (fs.existsSync(path.join(runtime, "srcds.exe"))) return;
        const source = path.join(GAMES_ROOT, "goldeneye-source");
        const stage = path.join(home, `.runtime-${process.pid}`);
        if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
        fs.cpSync(source, stage, { recursive: true });
        if (!fs.existsSync(path.join(stage, "srcds.exe")) || !fs.existsSync(path.join(stage, "gesource", "gameinfo.txt"))) {
          fs.rmSync(stage, { recursive: true });
          throw new Error("GoldenEye: Source needs Source 2007 server and the GE:S 5.0.6 server archive");
        }
        fs.renameSync(stage, runtime);
      },
      args: (port, ctx) => [
        "-console", "-game", "gesource", "-strictportbind", "-norestart",
        "-port", String(port), "+map", "ge_archives",
        "-maxplayers", String(managedPlayerLimit(ctx)),
        "+hostname", `"${serverName(ctx, "PlayBound GoldenEye: Source")}"`,
        ...(ctx.rconPassword ? ["+rcon_password", ctx.rconPassword] : []),
      ],
    },
    "counter-strike-source": {
      portStart: 27060,
      portEnd: 27070,
      protocol: "udp",
      rcon: "source",
      binaries: gameBin("counter-strike-source", ["srcds_run", "srcds_linux"]),
      cwd: () => path.join(GAMES_ROOT, "counter-strike-source"),
      startupReadyTimeoutMs: 60_000,
      spawnEnv: isolatedHomeEnv("counter-strike-source-servers"),
      // Without steamclient.so in ~/.steam/sdk32 srcds runs LAN-only. Best effort: a missing
      // file is left for the operator to see in the server log rather than failing the start.
      prepareSpawn: async (_port, ctx) => {
        const root = path.join(GAMES_ROOT, "counter-strike-source");
        const source = firstExisting([path.join(root, "bin", "steamclient.so"), path.join(root, "linux32", "steamclient.so")]);
        if (!source) return;
        const sdk = path.join(ctx.customerOwned ? customerHomeDir("counter-strike-source-servers", ctx) : HOST_HOME, ".steam", "sdk32");
        const link = path.join(sdk, "steamclient.so");
        if (fs.existsSync(link)) return;
        fs.mkdirSync(sdk, { recursive: true });
        fs.symlinkSync(source, link);
      },
      args: (port, ctx) => [
        "-game", "cstrike",
        "-strictportbind",
        // srcds_run's own restart loop would hide failures from the agent.
        "-norestart",
        "+ip", "0.0.0.0",
        "-port", String(port),
        "+map", "de_dust2",
        "-maxplayers", String(managedPlayerLimit(ctx)),
        // srcds re-splits its command line on spaces, so the name is quoted.
        "+hostname", `"${serverName(ctx, "PlayBound Dedicated")}"`,
        ...(ctx.rconPassword ? ["+rcon_password", ctx.rconPassword] : []),
      ],
    },

    terraria: {
      portStart: 7870,
      portEnd: 7890,
      protocol: "tcp",
      binaries: gameBin("terraria", ["1458/Linux/TerrariaServer.bin.x86_64", "TerrariaServer.bin.x86_64", "TerrariaServer"]),
      cwd: () => path.join(GAMES_ROOT, "terraria", "1458", "Linux"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 180_000,
      // Terraria keeps worlds under XDG_DATA_HOME/HOME; both point at the server's own folder.
      spawnEnv: isolatedHomeEnv("terraria-servers"),
      prepareSpawn: async (_port, ctx) => {
        fs.mkdirSync(path.join(serverDir("terraria-servers", ctx), "Worlds"), { recursive: true, mode: 0o700 });
      },
      args: (port, ctx) => [
        "-port", String(port),
        "-maxplayers", String(managedPlayerLimit(ctx)),
        // An absolute world path inside this server's folder; created on first start.
        "-world", path.join(serverDir("terraria-servers", ctx), "Worlds", "world.wld"),
        "-autocreate", "2",
        "-worldname", serverName(ctx, "PlayBound"),
        "-noupnp",
      ],
    },

    unturned: {
      portStart: 27075,
      portEnd: 27099,
      portStride: 3,
      portSpan: 3,
      protocol: "udp",
      binaries: gameBin("unturned", ["ServerHelper.sh"]),
      cwd: () => path.join(GAMES_ROOT, "unturned"),
      stdin: keepStdinOpen,
      shutdownCommand: "Shutdown\n",
      shutdownGraceMs: 20_000,
      startupReadyTimeoutMs: 90_000,
      spawnEnv: isolatedHomeEnv("unturned-servers"),
      prepareSpawn: async (_port, ctx) => {
        const data = serverDir("unturned-servers", ctx);
        const servers = path.join(GAMES_ROOT, "unturned", "Servers");
        fs.mkdirSync(servers, { recursive: true });
        const link = path.join(servers, `pb-${serverId(ctx)}`);
        if (fs.existsSync(link)) {
          if (!fs.lstatSync(link).isSymbolicLink() || fs.readlinkSync(link) !== data) {
            throw new Error("Unturned server data path is already occupied");
          }
        } else fs.symlinkSync(data, link, "dir");
        const tokenFile = path.join(data, "gslt.txt");
        // Anonymous startup is only useful for the admin spawn/usage test.
        // Unturned requires a GSLT for Internet servers joined by address.
        const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : null;
        if (!token && !ctx.testSpawn) throw new Error("An Unturned Steam game-server login token is required in this server's private gslt.txt for Internet hosting");
        if (token !== null && !/^[A-Fa-f0-9]{20,64}$/.test(token)) throw new Error("Invalid Unturned game-server login token");
        const configDir = path.join(data, "Server");
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(configDir, "Commands.dat"),
          `Name ${serverName(ctx, "PlayBound Dedicated")}\nMap PEI\nMaxPlayers ${managedPlayerLimit(ctx)}\nPort ${_port}\n${token ? `GSLT ${token}\n` : ""}`,
          { mode: 0o600 });
      },
      args: (_port, ctx) => [
        `${ctx.testSpawn && !fs.existsSync(path.join(serverDir("unturned-servers", ctx), "gslt.txt")) ? "+LanServer" : "+InternetServer"}/pb-${serverId(ctx)}`,
      ],
    },

    "rimworld-together": {
      portStart: 25590,
      portEnd: 25610,
      protocol: "tcp",
      binaries: gameBin("rimworld-together", ["RTServer"]),
      // The server keeps Configs/, Assets/, Backups/ and Logs/ under its working directory.
      cwd: (_port, ctx) => serverDir("rimworld-together-servers", ctx),
      stdin: keepStdinOpen,
      spawnEnv: isolatedHomeEnv("rimworld-together-servers"),
      prepareSpawn: async (port, ctx) => {
        mergeJsonConfig(path.join(serverDir("rimworld-together-servers", ctx), "Configs", "ServerConfig.json"), {
          Name: serverName(ctx, "PlayBound Dedicated"),
          IP: "0.0.0.0",
          Port: port,
          MaxPlayers: managedPlayerLimit(ctx),
          // A paid private server is joined by address, not listed publicly.
          EnableServerBrowser: false,
          EnableServerTelemetry: false,
          UseUPnP: false,
        });
      },
      args: () => [],
    },

    "core-keeper": {
      portStart: 1300,
      portEnd: 1320,
      portStride: 2, // Steam query socket uses game port + 1.
      protocol: "udp",
      binaries: gameBin("core-keeper", ["CoreKeeperServer"]),
      // Core Keeper's world generation needs a display even in -batchmode.
      // -nographics disables the GPU work and leaves startup stalled.
      resolveBinary: (candidates) => firstExisting(candidates) && fs.existsSync("/usr/bin/xvfb-run") ? "/usr/bin/xvfb-run" : null,
      cwd: () => path.join(GAMES_ROOT, "core-keeper"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 90_000,
      spawnEnv: isolatedHomeEnv("core-keeper-servers"),
      prepareSpawn: async (_port, ctx) => {
        const steamClient = firstExisting(gameBin("core-keeper", ["linux64/steamclient.so", "steamclient.so"]));
        if (steamClient) {
          const sdk = path.join(serverDir("core-keeper-servers", ctx), ".steam", "sdk64");
          fs.mkdirSync(sdk, { recursive: true, mode: 0o700 });
          const link = path.join(sdk, "steamclient.so");
          if (!fs.existsSync(link)) fs.symlinkSync(steamClient, link);
        }
        // ServerConfig.json sits in the data path. The world and game id are kept once
        // the game has chosen them; the player cap is set on every start.
        mergeJsonConfig(path.join(serverDir("core-keeper-servers", ctx), "data", "ServerConfig.json"), {
          gameId: "",
          world: 0,
          worldName: serverName(ctx, "PlayBound"),
          worldSeed: 0,
          maxNumberPlayers: managedPlayerLimit(ctx),
          maxNumberPacketsSentPerFrame: 1,
        }, { keepExisting: ["gameId", "world", "worldName", "worldSeed", "maxNumberPacketsSentPerFrame"] });
      },
      args: (port, ctx) => {
        const data = path.join(serverDir("core-keeper-servers", ctx), "data");
        return ["-a", "--", path.join(GAMES_ROOT, "core-keeper", "CoreKeeperServer"), "-batchmode", "-ip", "0.0.0.0", "-port", String(port), "-maxplayers", String(managedPlayerLimit(ctx)), "-datapath", data, "-logfile", path.join(data, "server.log")];
      },
    },

    "vintage-story": {
      portStart: 42420,
      portEnd: 42440,
      protocol: "both",
      binaries: gameBin("vintage-story", ["VintagestoryServer", "server.sh"]),
      cwd: () => path.join(GAMES_ROOT, "vintage-story"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 90_000,
      spawnEnv: isolatedHomeEnv("vintage-story-servers"),
      prepareSpawn: async (port, ctx) => {
        // The game fills in every other setting on first load and keeps them afterwards.
        mergeJsonConfig(path.join(serverDir("vintage-story-servers", ctx), "data", "serverconfig.json"), {
          ServerName: serverName(ctx, "PlayBound Dedicated"),
          Port: port,
          MaxClients: managedPlayerLimit(ctx),
          AdvertiseServer: false,
          Upnp: false,
        });
      },
      args: (_port, ctx) => ["--dataPath", path.join(serverDir("vintage-story-servers", ctx), "data")],
    },

    factorio: {
      portStart: 34197,
      portEnd: 34217,
      protocol: "udp",
      binaries: gameBin("factorio", ["bin/x64/factorio", "factorio"]),
      cwd: () => path.join(GAMES_ROOT, "factorio"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 120_000,
      spawnEnv: isolatedHomeEnv("factorio-servers"),
      prepareSpawn: async (_port, ctx) => {
        const dir = serverDir("factorio-servers", ctx);
        const configIni = path.join(dir, "config.ini");
        const save = path.join(dir, "saves", "save.zip");
        fs.mkdirSync(path.join(dir, "saves"), { recursive: true, mode: 0o700 });
        // Factorio's documented config.ini: read game data from the install, write everything to this server's folder.
        fs.writeFileSync(configIni, `[path]\nread-data=${path.join(GAMES_ROOT, "factorio", "data")}\nwrite-data=${dir}\n`, { mode: 0o600 });
        mergeJsonConfig(path.join(dir, "server-settings.json"), {
          name: serverName(ctx, "PlayBound Dedicated"),
          description: "Hosted by PlayBound",
          tags: [],
          max_players: managedPlayerLimit(ctx),
          // Joined by address, not listed publicly.
          visibility: { public: false, lan: false },
          require_user_verification: true,
          allow_commands: "admins-only",
          autosave_interval: 10,
          autosave_slots: 5,
          auto_pause: true,
          autosave_only_on_server: true,
        });
        if (!fs.existsSync(save)) {
          const binary = firstExisting(gameBin("factorio", ["bin/x64/factorio", "factorio"]));
          if (!binary) return;
          await execFile(binary, ["--config", configIni, "--create", save], { timeout: 120_000 });
        }
      },
      args: (port, ctx) => {
        const dir = serverDir("factorio-servers", ctx);
        return [
          "--config", path.join(dir, "config.ini"),
          "--start-server", path.join(dir, "saves", "save.zip"),
          "--server-settings", path.join(dir, "server-settings.json"),
          "--port", String(port),
          "--bind", "0.0.0.0",
        ];
      },
    },

    necesse: {
      portStart: 14160,
      portEnd: 14180,
      protocol: "udp",
      binaries: gameBin("necesse", ["jre/bin/java"]),
      cwd: () => path.join(GAMES_ROOT, "necesse"),
      stdin: keepStdinOpen,
      shutdownCommand: "stop\n",
      shutdownGraceMs: 20_000,
      startupReadyTimeoutMs: 120_000,
      spawnEnv: isolatedHomeEnv("necesse-servers"),
      prepareSpawn: async (_port, ctx) => {
        fs.mkdirSync(serverDir("necesse-servers", ctx), { recursive: true, mode: 0o700 });
      },
      args: (port, ctx) => [
        "-jar", path.join(GAMES_ROOT, "necesse", "Server.jar"),
        "-nogui", "-world", "PlayBound", "-port", String(port),
        "-slots", String(managedPlayerLimit(ctx)),
        "-datadir", serverDir("necesse-servers", ctx),
        "-pausewhenempty", "0",
      ],
    },

    "dont-starve-together": {
      portStart: 11020,
      portEnd: 11041,
      portStride: 3,
      portSpan: 3,
      protocol: "udp",
      binaries: gameBin("dont-starve-together", ["bin64/dontstarve_dedicated_server_nullrenderer_x64"]),
      cwd: () => path.join(GAMES_ROOT, "dont-starve-together", "bin64"),
      startupReadyTimeoutMs: 180_000,
      spawnEnv: isolatedHomeEnv("dont-starve-together-servers"),
      prepareSpawn: async (port, ctx) => {
        const root = path.join(serverDir("dont-starve-together-servers", ctx), "PlayBound", "Cluster_1");
        if (!fs.existsSync(path.join(root, "cluster_token.txt"))) {
          throw new Error("A Klei cluster token is required at this server's private cluster_token.txt");
        }
        fs.mkdirSync(path.join(root, "Master"), { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(root, "cluster.ini"),
          `[GAMEPLAY]\ngame_mode = survival\nmax_players = ${managedPlayerLimit(ctx)}\npause_when_empty = true\n\n[NETWORK]\ncluster_name = ${serverName(ctx, "PlayBound Dedicated")}\ncluster_intention = cooperative\nautosaver_enabled = true\n\n[MISC]\nconsole_enabled = true\n`,
          { mode: 0o600 });
        fs.writeFileSync(path.join(root, "Master", "server.ini"),
          `[NETWORK]\nserver_port = ${port}\n\n[SHARD]\nis_master = true\n\n[STEAM]\nmaster_server_port = ${port + 1}\nauthentication_port = ${port + 2}\n`,
          { mode: 0o600 });
      },
      args: (port, ctx) => [
        "-persistent_storage_root", serverDir("dont-starve-together-servers", ctx),
        "-conf_dir", "PlayBound", "-cluster", "Cluster_1", "-shard", "Master",
        "-port", String(port), "-players", String(managedPlayerLimit(ctx)),
        "-steam_master_server_port", String(port + 1),
        "-steam_authentication_port", String(port + 2),
      ],
    },

    barotrauma: {
      portStart: 27220,
      portEnd: 27239,
      portStride: 2,
      protocol: "udp",
      binaries: gameBin("barotrauma", ["DedicatedServer"]),
      resolveBinary: (candidates, ctx) => {
        if (!ctx) return firstExisting(candidates);
        const runtime = path.join(serverDir("barotrauma-servers", ctx), "runtime", "DedicatedServer");
        if (fs.existsSync(runtime)) return runtime;
        return firstExisting(candidates);
      },
      cwd: (_port, ctx) => path.join(serverDir("barotrauma-servers", ctx), "runtime"),
      startupReadyTimeoutMs: 120_000,
      spawnEnv: isolatedHomeEnv("barotrauma-servers"),
      prepareSpawn: async (port, ctx) => {
        const home = serverDir("barotrauma-servers", ctx);
        const runtime = path.join(home, "runtime");
        if (!fs.existsSync(path.join(runtime, "DedicatedServer"))) {
          const stage = path.join(home, `.runtime-${process.pid}`);
          if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
          fs.cpSync(path.join(GAMES_ROOT, "barotrauma"), stage, { recursive: true });
          fs.renameSync(stage, runtime);
        }
        const steamClient = firstExisting(gameBin("barotrauma", ["linux64/steamclient.so", "steamclient.so"]));
        if (steamClient) {
          const sdk = path.join(home, ".steam", "sdk64");
          fs.mkdirSync(sdk, { recursive: true, mode: 0o700 });
          const link = path.join(sdk, "steamclient.so");
          if (!fs.existsSync(link)) fs.symlinkSync(steamClient, link);
        }
        const settings = path.join(runtime, "serversettings.xml");
        let xml = fs.existsSync(settings) ? fs.readFileSync(settings, "utf8") : "<serversettings />";
        for (const [key, value] of Object.entries({
          ServerName: serverName(ctx, "PlayBound Dedicated"), port, queryport: port + 1,
          MaxPlayers: Math.min(16, managedPlayerLimit(ctx)), IsPublic: "False", enableupnp: "false",
        })) {
          const attr = `${key}="${xmlValue(value)}"`;
          const pattern = new RegExp(`\\b${key}="[^"]*"`);
          xml = pattern.test(xml) ? xml.replace(pattern, attr) : xml.replace(/<serversettings\b/, `<serversettings ${attr}`);
        }
        fs.writeFileSync(settings, xml, { mode: 0o600 });
      },
      args: () => [],
    },

    trackmania: {
      portStart: 23520,
      portEnd: 23539,
      portStride: 2,
      protocol: "both",
      binaries: gameBin("trackmania", ["TrackmaniaServer"]),
      resolveBinary: (candidates, ctx) => {
        if (!ctx) return firstExisting(candidates);
        const runtime = path.join(serverDir("trackmania-servers", ctx), "runtime", "TrackmaniaServer");
        if (fs.existsSync(runtime)) return runtime;
        return firstExisting(candidates);
      },
      cwd: (_port, ctx) => path.join(serverDir("trackmania-servers", ctx), "runtime"),
      startupReadyTimeoutMs: 120_000,
      spawnEnv: isolatedHomeEnv("trackmania-servers"),
      prepareSpawn: async (port, ctx) => {
        const home = serverDir("trackmania-servers", ctx);
        const accountFile = path.join(home, "dedicated-account.json");
        if (!fs.existsSync(accountFile)) throw new Error("A Trackmania dedicated server account is required for this server");
        const account = JSON.parse(fs.readFileSync(accountFile, "utf8"));
        if (!account || typeof account.login !== "string" || !account.login || typeof account.password !== "string" || !account.password) {
          throw new Error("The Trackmania dedicated server account needs a login and password");
        }
        const runtime = path.join(home, "runtime");
        if (!fs.existsSync(path.join(runtime, "TrackmaniaServer"))) {
          const stage = path.join(home, `.runtime-${process.pid}`);
          if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
          fs.cpSync(path.join(GAMES_ROOT, "trackmania"), stage, { recursive: true });
          fs.renameSync(stage, runtime);
        }
        const template = path.join(runtime, "UserData", "Config", "dedicated_cfg.default.txt");
        let xml = fs.readFileSync(template, "utf8");
        const replaceTag = (section, tag, value) => {
          const block = new RegExp(`(<${section}>)[\\s\\S]*?(<\\/${section}>)`);
          xml = xml.replace(block, (whole) => whole.replace(
            new RegExp(`(<${tag}>)[\\s\\S]*?(<\\/${tag}>)`),
            (_value, open, close) => `${open}${xmlValue(value)}${close}`));
        };
        const rpcSecretFile = path.join(home, "xmlrpc-passwords.json");
        let rpcPasswords;
        if (fs.existsSync(rpcSecretFile)) rpcPasswords = JSON.parse(fs.readFileSync(rpcSecretFile, "utf8"));
        else {
          rpcPasswords = Object.fromEntries(["SuperAdmin", "Admin", "User"].map((name) => [name, randomBytes(24).toString("hex")]));
          fs.writeFileSync(rpcSecretFile, JSON.stringify(rpcPasswords), { mode: 0o600 });
        }
        xml = xml.replace(/(<authorization_levels>)[\s\S]*?(<\/authorization_levels>)/, (block) =>
          block.replace(/(<level>)[\s\S]*?(<\/level>)/g, (level) => {
            const name = level.match(/<name>([^<]+)<\/name>/)?.[1];
            return name && rpcPasswords[name]
              ? level.replace(/(<password>)[\s\S]*?(<\/password>)/, (_value, open, close) => `${open}${xmlValue(rpcPasswords[name])}${close}`)
              : level;
          }));
        xml = xml.replace(/(<masterserver_account>)[\s\S]*?(<\/masterserver_account>)/, (_whole, open, close) =>
          `${open}<login>${xmlValue(account.login)}</login><password>${xmlValue(account.password)}</password>${close}`);
        replaceTag("server_options", "max_players", managedPlayerLimit(ctx));
        replaceTag("system_config", "server_port", port);
        replaceTag("system_config", "xmlrpc_port", port + 1);
        replaceTag("server_options", "name", serverName(ctx, "PlayBound Dedicated"));
        replaceTag("server_options", "hide_server", 1);
        const config = path.join(runtime, "UserData", "Config", "dedicated_cfg.txt");
        fs.writeFileSync(config, xml, { mode: 0o600 });
      },
      args: () => ["/dedicated_cfg=dedicated_cfg.txt", "/game_settings=MatchSettings/example.txt", "/nodaemon"],
    },
  };
}
