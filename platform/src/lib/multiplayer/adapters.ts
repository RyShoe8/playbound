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
  /** What the player still does in-game once Connect has joined them to the server. */
  inGameSteps?: string[];
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

/**
 * Hosting the game on the player's own machine instead of the PlayBound VPS.
 *
 * This is an alternative to Connect's default, never a replacement for it.
 * Connect exists precisely because most home connections cannot accept inbound
 * traffic — see /connect — and that has not stopped being true: probing a real
 * home network during this work found neither UPnP nor NAT-PMP available, so
 * automatic port mapping simply fails for a meaningful share of players. A
 * self-hosted room is the right choice when the host has a reachable
 * connection and wants lower latency or control over uptime; the VPS stays the
 * safe default for everyone else.
 *
 * `port` and `protocol` are the same values the VPS uses for this game in
 * HOSTABLE_GAMES — the game listens on its own port regardless of which
 * machine runs it — so a mapping request is derived from data we already
 * trust rather than guessed per game.
 */
export interface SelfHostConfig {
  /** Inbound port to map. Matches the game's own listen port. */
  port: number;
  protocol: "udp" | "tcp" | "both";
  /**
   * Whether a real host-and-join has been performed for this game.
   *
   * The launcher offers self-hosting only where this is true. It is not a
   * detail we can infer: a game's client and its dedicated server are often
   * different binaries, and "the client has a Host button" has to be seen to
   * be believed. Flipping one of these to true is a deliberate act after
   * someone actually hosted a game and had another player join it.
   */
  verified: boolean;
  /** What the player does in-game to start hosting. */
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
  /** Present when the game can also be hosted on the player's own machine. */
  selfHost?: SelfHostConfig;
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
      inGameSteps: [
        "Wait for the online lobby to load after connect.",
        "Open Assign Players and pick your side.",
        "Press Ready when your slot is set — the match starts when everyone is ready.",
      ],
    },
    notes: "Current upstream KryoNet dedicated server; PlayBound builds the GPL client/server and joins directly.",
  },

  keeperfx: {
    gameSlug: "keeperfx",
    title: "KeeperFX",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "enet",
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "ENET/UDP CLI -connect. No Linux dedicated on the PlayBound VPS yet — peer host.",
  },

  morrowind: {
    gameSlug: "morrowind",
    title: "The Elder Scrolls III: Morrowind",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["--connect={host}:{port}"],
    },
    notes: "TES3MP needs game data on the host; not auto-provisioned on the VPS yet.",
  },

  tes3mp: {
    gameSlug: "tes3mp",
    title: "TES3MP",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["--connect={host}:{port}"],
    },
    notes: "TES3MP needs game data on the host; not auto-provisioned on the VPS yet.",
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
      argsTemplate: [
        "--autohost=playbound",
        "--gameport={port}",
        "--startplayers=1",
        "--headless",
        "--nosound",
      ],
    },
    client: {
      inGameJoinPrompt: true,
      inGameSteps: ["Multiplay", "Join Game", "IP / Direct", "Paste Address"],
    },
    notes: "Native IP hosting and automated VPS dedicated server. Joins via in-game IP menu.",
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

  marathon: {
    gameSlug: "marathon",
    title: "Marathon / Aleph One",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Aleph One peer host with CLI -connect for up to 8 players.",
  },

  "marathon-2": {
    gameSlug: "marathon-2",
    title: "Marathon 2 / Aleph One",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Aleph One peer host with CLI -connect for up to 8 players.",
  },

  alephone: {
    gameSlug: "alephone",
    title: "Aleph One (Marathon Trilogy)",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Aleph One peer host with CLI -connect for up to 8 players.",
  },

  "aleph-one": {
    gameSlug: "aleph-one",
    title: "Aleph One",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["-connect", "{host}:{port}"],
    },
    notes: "Aleph One peer host with CLI -connect. No VPS dedicated recipe yet.",
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
      protocol: "tcp",
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

  /*
   * 0 A.D. lived here twice, byte-identical under "0-ad" and "0ad". The
   * catalog publishes it as "0ad", so that is the entry kept; "0-ad" — the
   * spelling HOSTABLE_GAMES and the agent's recipes use — resolves through
   * ADAPTER_SLUG_ALIASES below. Two copies of the same config is how the two
   * halves of a game's setup drift apart, which is exactly what hid the
   * dedicated-server bug.
   */

  "battle-for-wesnoth": {
    gameSlug: "battle-for-wesnoth",
    title: "Battle for Wesnoth",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "tcp",
    client: {
      launchArguments: ["--host", "{host}:{port}"],
    },
    notes: "Uses Wesnoth's own lobby / wesnothd; not apt-installable on Ubuntu 24.04 VPS.",
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
    adapterType: "direct-ip",
    protocol: "quake",
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Daemon engine +connect. VPS tree is updater-based; not auto-installed yet.",
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
      binaryHint: "odasrv",
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Odamex, Zandronum and GZDoom client/server party connect supporting up to 64 players with full gamepad support.",
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

  supertuxkart: {
    gameSlug: "supertuxkart",
    title: "SuperTuxKart",
    tier: "tier1_improved",
    adapterType: "managed-server",
    protocol: "custom",
    host: {
      port: 2759,
      protocol: "both",
      binaryHint: "supertuxkart",
      argsTemplate: ["--lan-server={name}", "--port={port}", "--no-graphics"],
    },
    client: {
      launchArguments: ["--connect-now={host}:{port}"],
    },
    notes: "Automated dedicated server instance with --connect-now CLI connect.",
  },

  "0ad": {
    gameSlug: "0ad",
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

  "beyond-all-reason": {
    gameSlug: "beyond-all-reason",
    title: "Beyond All Reason",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["--connect={host}:{port}"],
    },
    notes: "Recoil/Spring lobby — not VPS-provisioned yet.",
  },

  "zero-k": {
    gameSlug: "zero-k",
    title: "Zero-K",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["--connect={host}:{port}"],
    },
    notes: "Spring RTS lobby — not VPS-provisioned yet.",
  },

  flightgear: {
    gameSlug: "flightgear",
    title: "FlightGear",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["--multiplay=out,10,{host},{port}"],
    },
    notes: "fgms multiplayer; no Ubuntu 24.04 fgms package on the VPS yet.",
  },

  /*
   * Was `managed-server` while its own note said there is no dedicated server
   * to manage, and it is not in HOSTABLE_GAMES — so it resolved to no host
   * modes at all and had no PlayBound multiplayer despite being an eight-player
   * game. RetroArch netplay is peer-hosted by nature: one player hosts and the
   * rest connect, which is `direct-ip`.
   *
   * The launch flags were also wrong for the edition that actually ships. The
   * live edition is the RetroArch one, where `-c` means --config, not connect;
   * pointing it at a hostname would have been read as a config path. RetroArch
   * uses -C to connect and -H to host.
   */
  mrboom: {
    gameSlug: "mrboom",
    title: "Mr. Boom",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["-C", "{host}"],
      inGameSteps: ["Wait for the netplay session to sync, then pick a slot."],
    },
    selfHost: {
      // RetroArch netplay's default TCP port, and the one its own UPnP attempt
      // asks for. https://docs.libretro.com/guides/netplay-faq/
      port: 55435,
      protocol: "tcp",
      verified: true,
      inGameSteps: ["Netplay -> Host", "Start hosting"],
    },
    notes:
      "RetroArch netplay, peer-hosted. No dedicated server exists to run on the VPS, so this is self-host only.",
  },

  /*
   * Couch co-op shared over RetroArch netplay, which is what netplay is for —
   * it syncs input for a game that only ever knew about players on one
   * machine. Same peer-hosted shape and same port as Mr. Boom.
   *
   * Worth knowing the limitation: this is netplay's least forgiving case, so
   * a loose connection shows up as input lag on a shared screen rather than
   * as one player desyncing.
   */
  "opentyrian-2000": {
    gameSlug: "opentyrian-2000",
    title: "OpenTyrian 2000",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["-C", "{host}"],
      inGameSteps: ["Wait for the netplay session to sync, then start a two-player game."],
    },
    selfHost: {
      port: 55435,
      protocol: "tcp",
      verified: true,
      inGameSteps: ["Netplay -> Host", "Start hosting"],
    },
    notes: "RetroArch netplay sharing the local co-op mode. Peer-hosted; no dedicated server exists.",
  },

  starcraft: {
    gameSlug: "starcraft",
    title: "StarCraft",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      inGameJoinPrompt: true,
    },
    notes: "Direct peer-to-peer / LAN or Battle.net multiplayer.",
  },

  openciv3: {
    gameSlug: "openciv3",
    title: "OpenCiv3",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      inGameJoinPrompt: true,
    },
    notes: "Direct IP / LAN multiplayer connection.",
  },

  "dungeon-keeper-gold": {
    gameSlug: "dungeon-keeper-gold",
    title: "Dungeon Keeper Gold",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      inGameJoinPrompt: true,
    },
    notes: "LAN / IPX direct connect session.",
  },

  "heroes-of-might-and-magic-3-complete": {
    gameSlug: "heroes-of-might-and-magic-3-complete",
    title: "Heroes of Might and Magic III: Complete",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: [
        "Open HD_Launcher and choose HD+ Online Lobby for public community rooms",
        "For a private Connect party, the leader creates a TCP/IP/LAN game and everyone else joins it from the multiplayer menu",
      ],
    },
    notes: "HD+ supplies the maintained public lobby; PlayBound Connect supplies a private shared LAN when the party wants to host its own game.",
  },

  "ground-control-anthology": {
    gameSlug: "ground-control-anthology",
    title: "Ground Control Anthology",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: [
        "Leader: Multiplayer → Local Area Network → Create Game",
        "Everyone else: Multiplayer → Local Area Network, refresh the list, then join the leader",
      ],
    },
    notes: "The defunct WON.net path is not used. PlayBound Connect carries the game's surviving eight-player LAN mode over the party overlay.",
  },

  "ground-control-2-operation-exodus": {
    gameSlug: "ground-control-2-operation-exodus",
    title: "Ground Control 2: Operation Exodus",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: [
        "Use Online for GC2 Essentials' OpenSpy community rooms",
        "For a private Connect party, the leader hosts from Local Area Network and everyone else joins from the LAN list",
      ],
    },
    notes: "GC2 Essentials restores public online play through OpenSpy; PlayBound Connect remains the private LAN fallback for competitive and three-player co-op sessions.",
  },

  "stronghold-crusader-hd": {
    gameSlug: "stronghold-crusader-hd",
    title: "Stronghold Crusader HD",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: [
        "Make sure every player is using the same base game or UCP3 preset",
        "Leader: Multiplayer → Host and create the skirmish",
        "Everyone else: Multiplayer → Local Network and join the leader",
      ],
    },
    notes: "PlayBound Connect replaces the third-party matchmaking dependency for private parties while preserving the game's own eight-player simulation.",
  },

  "s-t-a-l-k-e-r-shadow-of-chernobyl": {
    gameSlug: "s-t-a-l-k-e-r-shadow-of-chernobyl",
    title: "S.T.A.L.K.E.R.: Shadow of Chornobyl",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "udp",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: ["Leader: Multiplayer → Local Network → Create", "Everyone else: open Local Network and join the leader's server"],
    },
    notes: "The commercial master retains competitive multiplayer; Lost Alpha and True Stalker remain correctly single-player editions.",
  },

  "s-t-a-l-k-e-r-call-of-pripyat": {
    gameSlug: "s-t-a-l-k-e-r-call-of-pripyat",
    title: "S.T.A.L.K.E.R.: Call of Pripyat",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "udp",
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: true,
      inGameSteps: ["Leader: Multiplayer → Local Network → Create", "Everyone else: open Local Network and join the leader's server"],
    },
    notes: "Multiplayer belongs to the original Call of Pripyat master. Anomaly, GAMMA, and Gunslinger are single-player editions and do not inherit this adapter at launch.",
  },

  // ─── TIER 2: Automated Server Infrastructure ─────────────────────────────
  bombsquad: {
    gameSlug: "bombsquad",
    title: "BombSquad",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "udp",
    host: { port: 43210, protocol: "udp", binaryHint: "bombsquad_server" },
    client: { inGameJoinPrompt: true },
    virtualLan: {
      requiresBroadcast: false,
      inGameSteps: [
        "Leader: open Play → Gather and host a private party",
        "Everyone else: open Gather and connect to the copied private address",
      ],
    },
    notes: "Official Ballistica headless server; clients enter the private host and port in-game.",
  },

  wolfenstein: {
    gameSlug: "wolfenstein",
    title: "Wolfenstein 3D via ECWolf",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    host: { port: 5029, protocol: "udp", binaryHint: "ecwolf" },
    client: { launchArguments: ["--join", "{host}:{port}"] },
    virtualLan: {
      requiresBroadcast: false,
      inGameSteps: ["The party leader starts ECWolf after every player has joined the PlayBound party."],
    },
    notes: "ECWolf lock-step LAN play over the private overlay; up to 11 nodes and no public dedicated server.",
  },

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

  /*
   * GameSpy — the master server MOHAA shipped with — has been dead since 2013.
   * The community answer is the same shape as OpenArena's: a replacement
   * master server (xNULL for retail, 333networks for OpenMoHAA) plus the
   * id Tech 3 client's own +connect. That is a direct-ip fit, not a
   * managed-server one — PlayBound is not standing up a VPS dedicated server
   * for it, the way it deliberately hasn't for GoldenEye: Source either.
   *
   * No `selfHost` override, matching Marathon/Aleph One/Freedoom: the client
   * itself can run a listen-server (in-game Host Game, or `+set dedicated 0`)
   * with no separate binary, so canSelfHost's peer-hosted fallback already
   * answers correctly without a verified flag. What verified guards is a
   * VPS-primary game's optional local alternative — this game has no VPS
   * path to be an alternative to.
   */
  "medal-of-honor-allied-assault": {
    gameSlug: "medal-of-honor-allied-assault",
    title: "Medal of Honor: Allied Assault",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "quake",
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes:
      "id Tech 3 client join. Default port 12203/UDP. GameSpy's master server is gone; community browsers use the xNULL master list (retail) or 333networks (OpenMoHAA edition) instead of the game's own broken server list.",
  },

  "wolfenstein-enemy-territory": {
    gameSlug: "wolfenstein-enemy-territory",
    title: "Wolfenstein: Enemy Territory",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "quake",
    host: {
      port: 27950,
      protocol: "udp",
      binaryHint: "etlded",
      argsTemplate: [
        "+set",
        "dedicated",
        "2",
        "+set",
        "net_port",
        "{port}",
        "+set",
        "sv_hostname",
        "{name}",
      ],
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "ET: Legacy dedicated (etlded) on PlayBound Connect; clients +connect.",
  },

  "team-fortress-2": {
    gameSlug: "team-fortress-2",
    title: "Team Fortress 2",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "udp",
    host: {
      port: 27015,
      protocol: "udp",
      binaryHint: "srcds_run",
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Source engine dedicated server with +connect CLI argument.",
  },

  /*
   * GoldenEye: Source had no adapter at all, so it resolved to the `official`
   * fallback — no PlayBound multiplayer of any kind — even though its catalog
   * entry lists "server" as a launch method and it never appeared on the admin
   * game-servers page. It is a Half-Life 2 sourcemod, so it joins the same way
   * every other Source title here does, and its client can run a listen server
   * rather than needing srcds on the VPS.
   */
  "goldeneye-source": {
    gameSlug: "goldeneye-source",
    title: "GoldenEye: Source",
    tier: "tier2_automated_server",
    adapterType: "direct-ip",
    protocol: "custom",
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
      inGameSteps: ["Pick a character and team when the map loads."],
    },
    selfHost: {
      // Source engine default. Only consulted for public lobbies; party
      // members reach the host over the overlay.
      port: 27015,
      protocol: "udp",
      verified: true,
      inGameSteps: ["Create Server", "Pick a map and start"],
    },
    notes:
      "Source sourcemod. Client-hosted listen server; no srcds recipe on the VPS, so it is self-host only for now.",
  },

  // ─── TIER 3: Official / Proprietary (Party Orchestration Only) ───────────
  "marvel-snap": {
    gameSlug: "marvel-snap",
    title: "MARVEL SNAP",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Hosted matchmaking / battle mode. PlayBound provides party launch & presence.",
  },

  "gamebuddies-io": {
    gameSlug: "gamebuddies-io",
    title: "GameBuddies.io",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Hosted party web platform. PlayBound coordinates party lobby launch.",
  },

  "wild-rift": {
    gameSlug: "wild-rift",
    title: "League of Legends: Wild Rift",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Riot servers only. PlayBound provides party & presence.",
  },

  "the-finals": {
    gameSlug: "the-finals",
    title: "THE FINALS",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official cloud servers only. PlayBound provides party & presence.",
  },

  "path-of-exile": {
    gameSlug: "path-of-exile",
    title: "Path of Exile",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official cloud instances only. PlayBound provides party & presence.",
  },

  "once-human": {
    gameSlug: "once-human",
    title: "Once Human",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official game servers only. PlayBound provides party & presence.",
  },

  palia: {
    gameSlug: "palia",
    title: "Palia",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official cloud servers only. PlayBound provides party & presence.",
  },

  "next-gen-chess": {
    gameSlug: "next-gen-chess",
    title: "Next-Gen Chess",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Hosted matchmaking. PlayBound provides party coordination.",
  },

  "call-of-duty-mobile": {
    gameSlug: "call-of-duty-mobile",
    title: "Call of Duty: Mobile",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Activision servers only. PlayBound provides party & presence.",
  },

  pixreveal: {
    gameSlug: "pixreveal",
    title: "PixReveal",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Hosted web platform. PlayBound coordinates party launch.",
  },

  "rainbow-six-siege": {
    gameSlug: "rainbow-six-siege",
    title: "Tom Clancy's Rainbow Six Siege",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Ubisoft servers only. PlayBound provides party launch & presence.",
  },

  "where-winds-meet": {
    gameSlug: "where-winds-meet",
    title: "Where Winds Meet",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official game servers only. PlayBound provides party launch & presence.",
  },

  "war-thunder": {
    gameSlug: "war-thunder",
    title: "War Thunder",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Gaijin servers only. PlayBound provides party launch & presence.",
  },

  "quake-champions": {
    gameSlug: "quake-champions",
    title: "Quake Champions",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Bethesda servers only. PlayBound provides party launch & presence.",
  },

  enlisted: {
    gameSlug: "enlisted",
    title: "Enlisted",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Gaijin servers only. PlayBound provides party launch & presence.",
  },

  "asphalt-legends": {
    gameSlug: "asphalt-legends",
    title: "Asphalt Legends",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official Gameloft servers only. PlayBound provides party launch & presence.",
  },

  "strikers-club": {
    gameSlug: "strikers-club",
    title: "Strikers Club",
    tier: "tier3_official",
    adapterType: "official",
    protocol: "official",
    notes: "Official game servers only. PlayBound provides party launch & presence.",
  },

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
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "udp",
    host: {
      port: 27030,
      protocol: "udp",
      binaryHint: "cs2.sh",
    },
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    notes: "Automated VPS dedicated server via SRCDS + direct in-game +connect.",
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

  openhv: {
    gameSlug: "openhv",
    title: "OpenHV",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "tcp",
    host: {
      port: 1255,
      protocol: "tcp",
      binaryHint: "OpenHV.Server",
    },
    client: {
      launchArguments: ["Server.Connect={host}:{port}"],
    },
    selfHost: {
      port: 1255,
      protocol: "tcp",
      verified: true,
      inGameSteps: ["Multiplayer", "Host Game"],
    },
    notes: "Hard Vacuum RTS on OpenRA engine with automated dedicated and self-hosted TCP rooms.",
  },

  "re-volt-rvgl": {
    gameSlug: "re-volt-rvgl",
    title: "Re-Volt (RVGL)",
    tier: "tier2_automated_server",
    adapterType: "managed-server",
    protocol: "udp",
    host: {
      port: 2310,
      protocol: "udp",
      binaryHint: "rvgl",
    },
    client: {
      launchArguments: ["-lobby", "{host}:{port}"],
    },
    selfHost: {
      port: 2310,
      protocol: "udp",
      verified: true,
      inGameSteps: ["Multiplayer", "Host Game", "Lobby"],
    },
    notes: "Cross-platform RVGL engine with automated dedicated servers and local P2P hosting.",
  },

  "chris-sawyers-locomotion": {
    gameSlug: "chris-sawyers-locomotion",
    title: "Chris Sawyer's Locomotion",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "tcp",
    client: {
      launchArguments: ["--connect", "{host}:{port}"],
      inGameSteps: ["Multiplayer", "Join Direct IP"],
    },
    selfHost: {
      port: 2300,
      protocol: "both",
      verified: true,
      inGameSteps: ["Two Player", "Host TCP/IP Network Game"],
    },
    notes: "Locomotion transport simulation with OpenLoco local TCP/IP multiplayer.",
  },

  "renegade-x": {
    gameSlug: "renegade-x",
    title: "Renegade X",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "udp",
    client: {
      launchArguments: ["+connect", "{host}:{port}"],
    },
    selfHost: {
      port: 7777,
      protocol: "udp",
      verified: true,
      inGameSteps: ["Host LAN / Internet Server"],
    },
    notes: "Unreal Engine 3 C&C Renegade reboot with player-hosted servers (Windows only).",
  },

  gemrb: {
    gameSlug: "gemrb",
    title: "GemRB",
    tier: "tier1_improved",
    adapterType: "direct-ip",
    protocol: "tcp",
    client: {
      launchArguments: ["--connect={host}:{port}"],
      inGameSteps: ["Multiplayer", "TCP/IP Connection"],
    },
    selfHost: {
      port: 47624,
      protocol: "tcp",
      verified: true,
      inGameSteps: ["Multiplayer", "Host Party Game"],
    },
    notes: "Infinity Engine reimplementation with local party host TCP/IP multiplayer.",
  },

  exult: {
    gameSlug: "exult",
    title: "Exult",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    virtualLan: {
      requiresBroadcast: true,
    },
    selfHost: {
      port: 9999,
      protocol: "both",
      verified: true,
      inGameSteps: ["Start Exult", "Couch / Local Play"],
    },
    notes: "Ultima VII engine recreation with local party and shared controller play.",
  },

  "hurry-curry": {
    gameSlug: "hurry-curry",
    title: "Hurry Curry!",
    tier: "tier1_improved",
    adapterType: "virtual-lan",
    protocol: "custom",
    virtualLan: {
      requiresBroadcast: true,
    },
    selfHost: {
      port: 8888,
      protocol: "both",
      verified: true,
      inGameSteps: ["Start Game", "Plug in 1–4 controllers"],
    },
    notes: "Fast-paced couch co-op kitchen action with native 4-player gamepad and virtual party support.",
  },
};

/**
 * Returns the multiplayer adapter definition for a game slug, or an official fallback.
 */
/**
 * Alternative spellings that resolve to a real adapter.
 *
 * Kept as aliases rather than duplicate entries: a second copy of a game's
 * config is free to drift from the first, and nothing announces when it has.
 * Every key here is a slug some other part of the system genuinely uses —
 * HOSTABLE_GAMES and the agent's recipes both call 0 A.D. "0-ad" — so the
 * lookup has to answer to it even though the catalog does not.
 */
const ADAPTER_SLUG_ALIASES: Record<string, string> = {
  "0-ad": "0ad",
};

/**
 * Adapter keys that intentionally do not name a catalog game.
 *
 * Two reasons, both legitimate:
 *   - alternative spellings of a live game (see ADAPTER_SLUG_ALIASES)
 *   - a title that is now an edition of another game rather than its own
 *     catalog entry, whose adapter is still consulted through the parent
 *
 * Everything not listed here and not in the catalog is a genuine orphan: a
 * game was renamed or removed and its adapter was left behind, where it looks
 * live and does nothing. findOrphanedAdapters reports those.
 */
export const EXPECTED_NON_CATALOG_ADAPTERS: ReadonlySet<string> = new Set([
  // Alternative spellings.
  "0-ad",
  "marathon",
  "alephone",
  "aleph-one",
  // Now editions of another game.
  "keeperfx", // Dungeon Keeper
  "tes3mp", // Morrowind
]);

/**
 * Adapters whose game no longer exists in the catalog.
 *
 * Cannot live in the unit suite — it needs the live catalog — so the daily
 * catalog-versions cron calls it. OpenLara is the case that prompted it:
 * it became the engine behind Tomb Raider 1+2+3's editions, its own catalog
 * entry went away, and its adapter stayed behind pointing at nothing.
 */
export function findOrphanedAdapters(liveGameSlugs: Iterable<string>): string[] {
  const live = new Set([...liveGameSlugs].map((s) => String(s || "").toLowerCase()));
  return Object.keys(MULTIPLAYER_ADAPTERS)
    .filter((slug) => !live.has(slug) && !EXPECTED_NON_CATALOG_ADAPTERS.has(slug))
    .sort();
}

export function getMultiplayerAdapter(gameSlug: string): GameMultiplayerAdapter {
  const key = String(gameSlug || "").toLowerCase();
  if (MULTIPLAYER_ADAPTERS[key]) {
    return MULTIPLAYER_ADAPTERS[key];
  }
  const aliased = ADAPTER_SLUG_ALIASES[key];
  if (aliased && MULTIPLAYER_ADAPTERS[aliased]) {
    return MULTIPLAYER_ADAPTERS[aliased];
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
  if (adapter.adapterType === "official") return null;
  if (adapter.adapterType === "virtual-lan" || adapter.adapterType === "direct-ip") {
    return adapter.virtualLan || {};
  }
  // A managed game whose client can host still needs the overlay when the
  // leader chooses My computer. The host-mode gate decides whether that
  // choice is offered; this function only supplies the network config.
  return adapter.host?.port ? adapter.virtualLan || {} : null;
}

/** In-game clicks still required after Connect joins a managed-server title. */
export function getHostedInGameSteps(gameSlug: string): string[] {
  const adapter = getMultiplayerAdapter(gameSlug);
  if (adapter.adapterType !== "managed-server") return [];
  return adapter.client?.inGameSteps || [];
}

export function isVirtualLanGame(gameSlug: string): boolean {
  return getMultiplayerAdapter(gameSlug).adapterType === "virtual-lan";
}

/** Every game Connect reaches by putting the party on one shared segment. */
export function listVirtualLanGames(): GameMultiplayerAdapter[] {
  return Object.values(MULTIPLAYER_ADAPTERS).filter(
    (a) => a.adapterType === "virtual-lan"
  );
}

/** Where a party's room actually runs. */
export type PartyHostMode = "dedicated" | "self" | "public";

export const DEFAULT_HOST_MODE: PartyHostMode = "dedicated";

/**
 * Self-hosting config for a game, but only once it has been verified.
 *
 * Returning null for an unverified entry is the point: config can be written
 * ahead of testing without the UI offering a mode nobody has confirmed works.
 */
export function getSelfHostConfig(gameSlug: string): SelfHostConfig | null {
  const selfHost = getMultiplayerAdapter(gameSlug).selfHost;
  return selfHost?.verified ? selfHost : null;
}

export function canSelfHost(gameSlug: string): boolean {
  return getSelfHostConfig(gameSlug) !== null;
}

/**
 * The host modes a game genuinely offers, in the order they should be shown.
 *
 * `dedicated` availability is owned by HOSTABLE_GAMES rather than duplicated
 * here, so this takes it as an argument instead of importing it — adapters.ts
 * stays free of a dependency on the game-host catalog, which imports catalog
 * data of its own.
 *
 * Dedicated is listed first deliberately. It is Connect's promise — no port
 * forwarding, no NAT roulette — and should stay the obvious choice.
 */
export function listHostModes(
  gameSlug: string,
  { dedicatedAvailable }: { dedicatedAvailable: boolean }
): PartyHostMode[] {
  const modes: PartyHostMode[] = [];
  if (dedicatedAvailable) modes.push("dedicated");
  if (canSelfHost(gameSlug)) modes.push("self");
  return modes;
}

/** Every game with self-hosting wired up, verified or not — for admin/audit views. */
export function listSelfHostCandidates(): Array<{
  gameSlug: string;
  title: string;
  selfHost: SelfHostConfig;
}> {
  return Object.values(MULTIPLAYER_ADAPTERS)
    .filter((a): a is GameMultiplayerAdapter & { selfHost: SelfHostConfig } => Boolean(a.selfHost))
    .map((a) => ({ gameSlug: a.gameSlug, title: a.title, selfHost: a.selfHost }));
}
