/**
 * Server recipes for games offered on the paid Dedicated plan.
 *
 * Kept apart from recipes.js on purpose: none of these is part of free
 * community or party hosting, and each arrives as a `draft` profile that an
 * admin tests before it is offered. The slot cap is the one thing every recipe
 * must get right, so each one applies `managedPlayerLimit(ctx)` through the
 * mechanism the game's own server documents:
 *
 *   counter-strike-source  -maxplayers N            (LinuxGSM start parameters)
 *   terraria               -maxplayers N            (Terraria serverconfig.txt)
 *   unturned               -maxplayers N            (LinuxGSM start parameters)
 *   core-keeper            ServerConfig.json  maxNumberPlayers
 *   vintage-story          serverconfig.json  MaxClients
 *   factorio               server-settings.json  max_players
 *   rimworld-together      Configs/ServerConfig.json  MaxPlayers (refuses joins when full,
 *                          Source/Server/Hooks/TCPNetwork/ServerNetwork.cs)
 *
 * Every server keeps its files in its own folder under the host's home, named
 * pb-<server id>, so one customer's world can never be another's.
 *
 * The launch parameters come from those upstream sources. None of these
 * binaries has been started on the VPS from this code yet; docs/
 * dedicated-game-servers.md lists what to confirm on the first test start.
 */

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
      binaries: gameBin("terraria", ["TerrariaServer", "TerrariaServer.bin.x86_64"]),
      cwd: () => path.join(GAMES_ROOT, "terraria"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 60_000,
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
      protocol: "udp",
      binaries: gameBin("unturned", ["Unturned_Headless.x86_64"]),
      cwd: () => path.join(GAMES_ROOT, "unturned"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 90_000,
      spawnEnv: isolatedHomeEnv("unturned-servers"),
      args: (port, ctx) => [
        "-nographics", "-batchmode",
        "-bind", "0.0.0.0",
        "-port", String(port),
        "-maxplayers", String(managedPlayerLimit(ctx)),
        "-name", serverName(ctx, "PlayBound Dedicated"),
        // Unturned keeps this server's world and settings in Servers/<this id>.
        `+InternetServer/pb-${serverId(ctx)}`,
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
      protocol: "udp",
      binaries: gameBin("core-keeper", ["CoreKeeperServer"]),
      cwd: () => path.join(GAMES_ROOT, "core-keeper"),
      stdin: keepStdinOpen,
      startupReadyTimeoutMs: 90_000,
      spawnEnv: isolatedHomeEnv("core-keeper-servers"),
      prepareSpawn: async (_port, ctx) => {
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
        return ["-batchmode", "-ip", "0.0.0.0", "-port", String(port), "-datapath", data, "-logfile", path.join(data, "server.log")];
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
  };
}
