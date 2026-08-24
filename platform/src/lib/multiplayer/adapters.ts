/**
 * PlayBound Multiplayer Adapter Framework.
 *
 * Rather than forcing every game onto a single networking stack, PlayBound
 * uses declarative adapters tailored to each game's architecture:
 *
 *   1. `playbound-native` — Custom P2P mod / transport with room codes (e.g. HoloCure).
 *   2. `managed-server`  — Automatic dedicated server process spawned on the PlayBound VPS (e.g. OpenRA, OpenTTD).
 *   3. `direct-ip`       — Direct peer connection with CLI argument join (e.g. KeeperFX, Marathon 2).
 *   4. `virtual-lan`     — LAN-only game put on one L2 overlay so its own discovery works (e.g. HoloCure).
 *   5. `official`        — Unmodified proprietary/official network layer; PlayBound provides party launch & presence only.
 */

export type MultiplayerAdapterType =
  | "playbound-native"
  | "managed-server"
  | "direct-ip"
  | "virtual-lan"
  | "official";

export type MultiplayerTier =
  | "tier1_improved"          // PlayBound Multiplayer Editions (Material UX enhancement)
  | "tier2_automated_server"  // Automated server infrastructure & discovery
  | "tier3_official";         // Party orchestration only (leave networking alone)

export interface HostLaunchConfig {
  launch?: boolean;
  port?: number;
  protocol?: "udp" | "tcp" | "both";
  binaryHint?: string;
  argsTemplate?: string[];
}

export interface ClientLaunchConfig {
  launchArguments?: string[];
  inGameJoinPrompt?: boolean;
  requiresRoomCode?: boolean;
}

/**
 * A `virtual-lan` game does its own peer discovery and offers no address to
 * connect to, so PlayBound cannot hand it a host:port. Instead the party is
 * placed on one L2 overlay network and the game's existing LAN discovery does
 * the rest.
 *
 * `adapterFile` is a path inside the install that stores the network adapter
 * the game should listen on. Writing it means the player picks "use the saved
 * adapter" instead of hunting for the overlay in a dropdown.
 */
export interface VirtualLanConfig {
  /** Discovery needs L2 broadcast, so a routed overlay (WireGuard) will not do. */
  requiresBroadcast?: boolean;
  adapterFile?: string;
  /** What the player still has to click once the overlay is up. */
  inGameSteps?: string[];
}

export interface GameMultiplayerAdapter {
  gameSlug: string;
  title: string;
  tier: MultiplayerTier;
  adapterType: MultiplayerAdapterType;
  protocol?: "enet" | "gns" | "udp" | "tcp" | "quake" | "doom" | "custom" | "official";
  host?: HostLaunchConfig;
  client?: ClientLaunchConfig;
  virtualLan?: VirtualLanConfig;
  notes?: string;
}

export const MULTIPLAYER_ADAPTERS: Record<string, GameMultiplayerAdapter> = {
  // ─── TIER 1: PlayBound Multiplayer Editions ───────────────────────────────
  /*
   * HoloCure's multiplayer mod (upstream v1.4.1) offers exactly two ways in:
   * a Steam friend lobby, and a LAN session bound to a network adapter you
   * pick in-game. Our build comes from itch and ships no Steamworks — the
   * game logs "Couldn't load Steam API dll" and disables Steam features — so
   * LAN is the only path that exists for us.
   *
   * There is no room code, no address field and no CLI join, which is why
   * this is not `playbound-native` and cannot be `managed-server`: there is
   * nothing to spawn and nothing to connect to. Connect instead puts the
   * whole party on one overlay segment and lets the mod find itself, which
   * the mod's own README endorses ("if you want to connect via VPN as a LAN
   * game, then choose the name of the VPN network adapter").
   */
  holocure: {
    gameSlug: "holocure",
    title: "HoloCure - Save the Fans!",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "udp",
    client: {
      inGameJoinPrompt: true,
    },
    virtualLan: {
      requiresBroadcast: true,
      adapterFile: "MultiplayerMod/lastUsedNetworkAdapter",
      inGameSteps: [
        "Play → Multiplayer",
        "Use saved network adapter",
        "Host LAN Session (leader) or Join LAN Session (everyone else)",
      ],
    },
    notes:
      "Upstream mod, LAN-only for us. Connect supplies the shared segment; the mod does its own discovery.",
  },

  ysoccer: {
    gameSlug: "ysoccer",
    title: "YSoccer",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "custom",
    host: { port: 54555, protocol: "both" },
    client: {
      launchArguments: ["--connect={host}", "--tcp-port={port}", "--udp-port={port}"],
    },
    notes: "Current upstream KryoNet dedicated server; PlayBound builds the GPL client/server and joins directly.",
  },

  keeperfx: {
    gameSlug: "keeperfx",
    title: "KeeperFX",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "enet",
    host: {
      port: 5500,
      protocol: "both",
    },
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Direct ENET/UDP and TCP/IP with automatic CLI session argument join.",
  },

  /*
   * GoldenEye: Source is not a Steam product (no appid), so the Steam
   * GetServerList plumbing TF2/CS2 use has nothing to filter on, and there is
   * no community master API either — there is no honest public server list
   * for this game, full stop. Not registered in servers/registry.ts as a
   * result; a party's room is found through the party itself, not a browser.
   */
  "goldeneye-source": {
    gameSlug: "goldeneye-source",
    title: "GoldenEye: Source",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 27045,
      protocol: "both",
      binaryHint: "run-server",
      argsTemplate: ["-game", "gesource", "-port", "{port}", "+map", "ge_facility", "+maxplayers", "16"],
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    // Home internet cannot accept the inbound game port a dedicated server
    // needs, so self-hosting rides the party's virtual-LAN overlay instead
    // of a forwarded port: the leader's own listen server binds the overlay
    // adapter, everyone else's {host} resolves to that private IP.
    virtualLan: {
      requiresBroadcast: false,
      inGameSteps: [
        "Open the console (~) and run: map ge_facility",
        "Set maxplayers before the map loads: maxplayers 16",
      ],
    },
    notes:
      "PlayBound-hosted srcds instance under Wine; +connect joins directly. No public server list exists for this game, so there is no live player count outside an active party.",
  },

  "warzone-2100": {
    gameSlug: "warzone-2100",
    title: "Warzone 2100",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 2100,
      protocol: "both",
      binaryHint: "warzone2100",
      argsTemplate: ["--dedicated", "--port={port}"],
    },
    client: {
      launchArguments: ["--connect={host}:{port}"],
    },
    notes: "Native IP hosting and automated VPS dedicated server.",
  },

  mindustry: {
    gameSlug: "mindustry",
    title: "Mindustry",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 6567,
      protocol: "both",
      binaryHint: "server-release.jar",
    },
    client: {
      inGameJoinPrompt: true,
    },
    notes: "Java headless server on VPS with direct IP in-game client connect.",
  },

  "marathon-2": {
    gameSlug: "marathon-2",
    title: "Marathon 2 / Aleph One",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    host: {
      port: 4226,
      protocol: "udp",
    },
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Open-source Aleph One UDP engine with CLI connect join.",
  },

  "aleph-one": {
    gameSlug: "aleph-one",
    title: "Aleph One",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    host: {
      port: 4247,
      protocol: "udp",
    },
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Aleph One engine UDP multiplayer.",
  },

  hedgewars: {
    gameSlug: "hedgewars",
    title: "Hedgewars",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 46631,
      protocol: "both",
      binaryHint: "hedgewars-server",
      argsTemplate: ["-p", "{port}"],
    },
    client: {
      inGameJoinPrompt: true,
    },
    notes: "Automated VPS hedgewars-server daemon.",
  },

  triplea: {
    gameSlug: "triplea",
    title: "TripleA",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "tcp",
    host: {
      port: 3303,
      protocol: "tcp",
      binaryHint: "triplea.jar",
    },
    client: {
      launchArguments: ["-Dserver.address={host}", "-Dserver.port={port}"],
    },
    notes: "Turn-based Java network engine with CLI server parameters.",
  },

  openttd: {
    gameSlug: "openttd",
    title: "OpenTTD",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 3979,
      protocol: "both",
      binaryHint: "openttd",
      argsTemplate: ["-D", "0.0.0.0:{port}"],
    },
    client: {
      launchArguments: ["-n", "{host}:{port}"],
    },
    notes: "Automated dedicated server instance with -n CLI connect.",
  },

  openra: {
    gameSlug: "openra",
    title: "OpenRA",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 1234,
      protocol: "udp",
      binaryHint: "OpenRA.Server",
      argsTemplate: ["Server.ListenPort={port}"],
    },
    client: {
      /*
       * Game.Mod is not optional here. OpenRA's ra / cnc / d2k are separate
       * games on one engine, the server is started with an explicit mod, and a
       * client that does not name one joins with whatever it last had open —
       * which the server then rejects as "running an incompatible mod", even
       * when both sides are on the same engine version.
       */
      launchArguments: ["Game.Mod={mod}", "Launch.Connect={host}:{port}"],
    },
    notes: "Dedicated C&C server engine with settings argv CLI connect.",
  },

  "0-ad": {
    gameSlug: "0-ad",
    title: "0 A.D.",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "udp",
    host: {
      port: 20595,
      protocol: "udp",
      binaryHint: "pyrogenesis",
      argsTemplate: ["-autostart-nonrandom=1", "--port={port}"],
    },
    client: {
      launchArguments: ["-autostart={host}:{port}"],
    },
    notes: "Pyrogenesis headless host with -autostart CLI connection.",
  },

  "battle-for-wesnoth": {
    gameSlug: "battle-for-wesnoth",
    title: "Battle for Wesnoth",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "tcp",
    host: {
      port: 15000,
      protocol: "tcp",
      binaryHint: "wesnothd",
      argsTemplate: ["-p", "{port}"],
    },
    client: {
      launchArguments: ["--host", "{host}:{port}"],
    },
    notes: "Automated wesnothd daemon with --host CLI connect.",
  },

  openarena: {
    gameSlug: "openarena",
    title: "OpenArena",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "quake",
    host: {
      port: 27960,
      protocol: "udp",
      binaryHint: "openarena-server",
      argsTemplate: ["+set", "dedicated", "1", "+set", "net_port", "{port}"],
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Quake III dedicated server with +connect CLI argument.",
  },

  xonotic: {
    gameSlug: "xonotic",
    title: "Xonotic",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "quake",
    host: {
      port: 26000,
      protocol: "udp",
      binaryHint: "xonotic-linux64-dedicated",
      argsTemplate: ["+port", "{port}"],
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "DarkPlaces dedicated server with +connect CLI argument.",
  },

  unvanquished: {
    gameSlug: "unvanquished",
    title: "Unvanquished",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "quake",
    host: {
      port: 27990,
      protocol: "udp",
      binaryHint: "daemon",
      argsTemplate: ["+set", "dedicated", "2", "+set", "net_port", "{port}"],
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Daemon engine dedicated server with +connect CLI argument.",
  },

  luanti: {
    gameSlug: "luanti",
    title: "Luanti",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 30000,
      protocol: "udp",
      binaryHint: "luantiserver",
      argsTemplate: ["--port", "{port}"],
    },
    client: {
      launchArguments: ["--go", "--address", "{host}", "--port", "{port}"],
    },
    notes: "Minetest server engine with --go direct connect arguments.",
  },

  freedoom: {
    gameSlug: "freedoom",
    title: "Freedoom",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "doom",
    host: {
      port: 10666,
      protocol: "udp",
      binaryHint: "odamex-server",
      argsTemplate: ["-port", "{port}"],
    },
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Doom engine dedicated server (Odamex / Zandronum).",
  },

  freeciv: {
    gameSlug: "freeciv",
    title: "Freeciv",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "tcp",
    host: {
      port: 5556,
      protocol: "tcp",
      binaryHint: "freeciv-server",
      argsTemplate: ["-p", "{port}"],
    },
    client: {
      launchArguments: ["--autoconnect", "--server", "{host}", "--port", "{port}"],
    },
    notes: "Freeciv dedicated server. Client needs --autoconnect or GTK opens the start screen instead of joining.",
  },

  bzflag: {
    gameSlug: "bzflag",
    title: "BZFlag",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: { port: 5154, protocol: "both", binaryHint: "bzfs" },
    client: { launchArguments: ["{host}:{port}"] },
    notes: "PlayBound can run bzfs, or the party leader can host over the private overlay.",
  },

  supertuxkart: {
    gameSlug: "supertuxkart",
    title: "SuperTuxKart",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: { port: 2759, protocol: "both", binaryHint: "supertuxkart" },
    client: { launchArguments: ["--connect-now={host}:{port}"] },
    notes: "PlayBound dedicated room or a leader-hosted room over the private overlay.",
  },

  // ─── TIER 2: Automated Server Infrastructure ─────────────────────────────
  "space-station-14": {
    gameSlug: "space-station-14",
    title: "Space Station 14",
    tier: "tier2_automated_server",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["--connect-address", "ss14://{host}:{port}"],
    },
    notes: "Community server orchestration with ss14:// connect URI.",
  },

  veloren: {
    gameSlug: "veloren",
    title: "Veloren",
    tier: "tier2_automated_server",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["--connect", "{host}:{port}"],
    },
    notes: "Rust voxel RPG server connect.",
  },

  "wolfenstein-enemy-territory": {
    gameSlug: "wolfenstein-enemy-territory",
    title: "Wolfenstein: Enemy Territory",
    tier: "tier2_automated_server",
    adapterType: "direct-ip",
    protocol: "quake",
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Legacy idTech 3 multiplayer connect.",
  },

  // ─── TIER 3: Official / Proprietary (Party Orchestration Only) ───────────
  brawlhalla: {
    gameSlug: "brawlhalla",
    title: "Brawlhalla",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official online lobbies & matchmaking. PlayBound orchestrates party & presence.",
  },

  "counter-strike-2": {
    gameSlug: "counter-strike-2",
    title: "Counter-Strike 2",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Steam matchmaking & servers.",
  },

  valorant: {
    gameSlug: "valorant",
    title: "Valorant",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Riot Games official matchmaking & servers.",
  },

  "league-of-legends": {
    gameSlug: "league-of-legends",
    title: "League of Legends",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Riot Games official matchmaking.",
  },

  "dota-2": {
    gameSlug: "dota-2",
    title: "Dota 2",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Valve official matchmaking.",
  },

  warframe: {
    gameSlug: "warframe",
    title: "Warframe",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Digital Extremes matchmaking & squad invites.",
  },

  "apex-legends": {
    gameSlug: "apex-legends",
    title: "Apex Legends",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "EA / Respawn matchmaking.",
  },

  "genshin-impact": {
    gameSlug: "genshin-impact",
    title: "Genshin Impact",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "HoYoverse co-op world join.",
  },
};

/**
 * Returns the multiplayer adapter definition for a game slug, or an official fallback.
 */
export function getMultiplayerAdapter(gameSlug: string): GameMultiplayerAdapter {
  const key = String(gameSlug || "").toLowerCase();
  if (MULTIPLAYER_ADAPTERS[key]) {
    return MULTIPLAYER_ADAPTERS[key];
  }
  return {
    gameSlug: key,
    title: key,
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
  };
}

/**
 * Returns true if PlayBound actively provisions, connects, or hosts multiplayer for this game.
 */
export function isPlayBoundManagedMultiplayer(gameSlug: string): boolean {
  const adapter = getMultiplayerAdapter(gameSlug);
  return adapter.adapterType !== "official";
}

/**
 * Returns the tier classification of the title.
 */
export function getMultiplayerTier(gameSlug: string): MultiplayerTier {
  return getMultiplayerAdapter(gameSlug).tier;
}

/**
 * Returns the overlay config when this game reaches its friends over a shared
 * LAN segment rather than an address, else null.
 */
export function getVirtualLanConfig(gameSlug: string): VirtualLanConfig | null {
  const adapter = getMultiplayerAdapter(gameSlug);
  // Either this game only ever finds friends over LAN (HoloCure), or it can
  // optionally be self-hosted over one instead of PlayBound's VPS. Whether an
  // overlay is *currently* in use for a given party is `lan.status`, not this
  // — this only answers "does this game have LAN-overlay config at all".
  if (adapter.adapterType !== "virtual-lan" && !isSelfHostable(gameSlug)) return null;
  return adapter.virtualLan || {};
}

export function isVirtualLanGame(gameSlug: string): boolean {
  return getMultiplayerAdapter(gameSlug).adapterType === "virtual-lan";
}

/** True when the party leader can host this one themselves, as an alternative to PlayBound's VPS. */
export function isSelfHostable(gameSlug: string): boolean {
  const adapter = getMultiplayerAdapter(gameSlug);
  return (
    (adapter.adapterType === "managed-server" || adapter.adapterType === "direct-ip") &&
    Number.isInteger(adapter.host?.port)
  );
}

/** Every game Connect reaches by putting the party on one shared segment. */
export function listVirtualLanGames(): GameMultiplayerAdapter[] {
  return Object.values(MULTIPLAYER_ADAPTERS).filter(
    (a) => a.adapterType === "virtual-lan"
  );
}
