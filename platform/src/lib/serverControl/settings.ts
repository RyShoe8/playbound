/**
 * What a game's server lets a host change, and what changing it costs.
 *
 * PlayBound renders server controls from these declarations rather than from a
 * hand-written settings page per game. See docs/server-control.md for why the
 * schema comes before the UI and before any control channel.
 *
 * The load-bearing field is `apply`. A host needs to be told *before* they hit
 * save that max players cannot change under seven connected players without
 * dropping all seven — and the only place that can be known is here.
 */

/** When a change takes effect, and therefore what it costs the people playing. */
export type ApplyMode =
  /** Takes effect immediately on the running server. */
  | "live"
  /** Queued; takes effect at the next round or map change. */
  | "next-round"
  /** Needs the process restarted, which disconnects everyone. */
  | "restart";

/** How the adapter actually delivers the value. */
export type SettingBackend =
  /** A command-line argument at spawn. */
  | "startup"
  /** A file the adapter writes before spawn. */
  | "config-file"
  /** A command on a live control connection. */
  | "rcon";

/**
 * A control concept a player would recognise, independent of what any one game
 * calls it.
 *
 * Games name the same idea differently — Warzone's `maxPlayers` and ET's
 * `sv_maxclients` are one concept with two spellings — so cross-game questions
 * ("which games let us switch maps?") can only be answered against a shared
 * vocabulary. That is all this is.
 */
export type ControlFeature =
  | "map"
  | "gameMode"
  | "slots"
  | "bots"
  | "friendlyFire"
  | "timeLimit"
  | "password"
  | "restart";

export const CONTROL_FEATURE_LABELS: Record<ControlFeature, string> = {
  map: "Map switching",
  gameMode: "Game mode",
  slots: "Player slots",
  bots: "Bots",
  friendlyFire: "Friendly fire",
  timeLimit: "Time limit",
  password: "Password",
  restart: "Restart",
};

interface SettingBase {
  key: string;
  label: string;
  /** The shared concept this setting implements, when it is one of them. */
  feature?: ControlFeature;
  /** One line of plain help, shown under the control. */
  help?: string;
  apply: ApplyMode;
  backend: SettingBackend;
  /**
   * How an rcon-backed setting is delivered. The default is `set <key> "<value>"`,
   * which covers a cvar named the same as the key.
   *
   * `command` is for settings that are not a cvar at all — changing an ET map is
   * `map oasis`, not a variable. `{value}` is substituted. A command-applied
   * setting must be an `enum`, so the substituted text always comes from a
   * declared option and never from anything a host typed; see buildRconCommands.
   */
  rcon?: { cvar?: string; command?: string };
}

export type ServerSettingDefinition =
  | (SettingBase & { type: "number"; default: number; min?: number; max?: number })
  | (SettingBase & { type: "boolean"; default: boolean })
  | (SettingBase & { type: "string"; default: string; maxLength?: number })
  | (SettingBase & {
      type: "enum";
      default: string | number;
      options: readonly { value: string | number; label: string }[];
    });

export type ServerSettingValue = string | number | boolean;
export type ServerSettingValues = Record<string, ServerSettingValue>;

export interface ServerSettingProfile {
  slug: string;
  /**
   * The live control channel this game's server speaks, if it has one.
   *
   * Absent means every change costs a restart no matter what an adapter can
   * do — Warzone reads a challenge file once at spawn and then never listens
   * again. This is what decides whether `live` and `next-round` are even
   * possible, so it belongs to the game rather than to the adapter.
   */
  controlChannel?: "rcon-quake3";
  settings: readonly ServerSettingDefinition[];
  /**
   * Concepts this game will never have, and why.
   *
   * The distinction this exists for: a feature nobody has declared yet and a
   * feature that cannot exist look identical from the settings alone, and they
   * are not the same answer. Freeciv plays one generated map from start to
   * finish — "change map" is not missing from our coverage, it is missing from
   * the game. Saying "not yet" about that would send someone off to implement
   * something impossible, and saying nothing leaves the same trap unmarked.
   *
   * Only write an entry you can point at a reason for. Silence still means
   * "not assessed", which is the honest default for most of the catalog.
   */
  unavailable?: Partial<Record<ControlFeature, string>>;
}

/**
 * Warzone 2100.
 *
 * Every one of these was a literal inside `buildWarzoneAutohostConfig` in
 * platform/game-host/recipes.js, unreachable by the party leader hosting the
 * room. The defaults here are those literals, unchanged — this profile
 * describes what the agent already does, it does not change it.
 *
 * All of them are `restart` / `config-file` because that is the truth: the
 * agent writes a challenge JSON and Warzone reads it once at spawn. Nothing
 * here can move without a new process, and no amount of UI changes that. Live
 * control needs a control channel this game does not currently have.
 *
 * The option lists come from Warzone's challenge/autohost JSON format. Confirm
 * them against the build actually installed on the VPS before rendering them
 * as dropdowns — a wrong option is a room that fails to spawn.
 */
const WARZONE_2100: ServerSettingProfile = {
  slug: "warzone-2100",
  unavailable: {
    /*
     * Not "no rcon yet" — Warzone's autohost reads a challenge JSON once at
     * spawn and then never takes instruction again, so every one of these is a
     * restart no matter what channel we build.
     */
    friendlyFire: "Warzone reads its settings once at spawn; nothing can change mid-game.",
    timeLimit: "Warzone skirmish games have no time limit to set.",
  },
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "string",
      default: "Sk-Mountain",
      apply: "restart",
      backend: "config-file",
      help: "Must be a map the server build already has.",
    },
    {
      key: "maxPlayers",
      label: "Max players",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      /*
       * Deliberately unbounded above. The real ceiling is the chosen map's slot
       * count, which nothing in PlayBound knows yet — it is one of the things a
       * GameMap entity would carry. A guessed maximum would either block
       * legitimate rooms or let one fail at spawn, and letting the agent reject
       * it is better than either.
       */
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "techLevel",
      label: "Tech level",
      type: "enum",
      default: 1,
      options: [
        { value: 1, label: "Level 1" },
        { value: 2, label: "Level 2" },
        { value: 3, label: "Level 3" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "bases",
      label: "Starting bases",
      type: "enum",
      default: 2,
      options: [
        { value: 0, label: "No bases" },
        { value: 1, label: "Bases" },
        { value: 2, label: "Advanced bases" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "powerLevel",
      label: "Starting power",
      type: "enum",
      default: 1,
      options: [
        { value: 0, label: "Low" },
        { value: 1, label: "Medium" },
        { value: 2, label: "High" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "alliances",
      label: "Alliances",
      type: "enum",
      default: 0,
      options: [
        { value: 0, label: "Free for all" },
        { value: 1, label: "Allow alliances" },
        { value: 2, label: "Locked teams" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "scavengers",
      label: "Scavengers",
      type: "enum",
      default: 0,
      options: [
        { value: 0, label: "Off" },
        { value: 1, label: "On" },
        { value: 2, label: "Ultimate" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "openSpectatorSlots",
      label: "Spectator slots",
      type: "number",
      default: 4,
      min: 0,
      max: 10,
      apply: "restart",
      backend: "config-file",
    },
  ],
};

/**
 * Wolfenstein: Enemy Territory (ET: Legacy `etlded`).
 *
 * The first profile with a live control channel. The Quake 3 engine takes rcon
 * over its own UDP port, so most of this applies without dropping anyone — and
 * that is what makes the three apply modes worth having rather than a field
 * every game sets to "restart".
 *
 * Two settings are deliberately absent:
 *
 * `sv_hostname` — the room name already comes from the party. Offering it here
 * would be a second channel for one value, which is the mistake `maxPlayers`
 * made against the agent for months (see docs/server-control.md).
 *
 * `g_password` — a join password would lock out the party it is shown to. The
 * launcher's connect args carry no password, so setting one turns every
 * member's Join Game into a failure. A control that breaks the join path is
 * not a control.
 *
 * Cvar names and gametype numbers are from the ET/ET:Legacy console. Confirm
 * them against the build on the VPS before trusting the dropdowns — `g_warmup`
 * and `g_antilag` are already in assets/et-playbound.cfg, so those two are
 * known good on this deployment.
 */
const WOLFENSTEIN_ENEMY_TERRITORY: ServerSettingProfile = {
  slug: "wolfenstein-enemy-territory",
  controlChannel: "rcon-quake3",
  unavailable: {
    /*
     * ET ships no bots. Omni-bot is a separate mod, and this deployment
     * explicitly disables it — `omnibot_enable 0` is in the spawn args and in
     * assets/et-playbound.cfg — so a bot control here would have nothing to
     * talk to.
     */
    bots: "ET ships no bots; Omni-bot is a separate mod PlayBound does not install.",
    password: "A join password would lock out the party, whose connect args carry none.",
  },
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "enum",
      default: "oasis",
      /*
       * The six stock ET maps. An enum rather than free text because this one
       * is applied as a command (`map oasis`) rather than a cvar, and a
       * command must never carry anything a host typed.
       */
      options: [
        { value: "oasis", label: "Oasis" },
        { value: "battery", label: "Battery" },
        { value: "goldrush", label: "Gold Rush" },
        { value: "radar", label: "Radar" },
        { value: "railgun", label: "Railgun" },
        { value: "fueldump", label: "Fuel Dump" },
      ],
      // Changing the map restarts the round, not the server: nobody is dropped.
      apply: "live",
      backend: "rcon",
      rcon: { command: "map {value}" },
    },
    {
      key: "g_gametype",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: 4,
      options: [
        { value: 2, label: "Objective" },
        { value: 3, label: "Stopwatch" },
        { value: 4, label: "Campaign" },
        { value: 5, label: "Last man standing" },
      ],
      // Latched to the map: the cvar takes, the mode changes when the map does.
      apply: "next-round",
      backend: "rcon",
    },
    {
      key: "g_friendlyFire",
      label: "Friendly fire",
      feature: "friendlyFire",
      type: "boolean",
      default: true,
      apply: "live",
      backend: "rcon",
    },
    {
      key: "g_warmup",
      label: "Warmup seconds",
      type: "number",
      default: 10,
      min: 0,
      max: 120,
      apply: "next-round",
      backend: "rcon",
    },
    {
      key: "sv_maxclients",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 20,
      min: 2,
      max: 64,
      /*
       * Latched in the Quake 3 engine — the cvar accepts a new value and the
       * server keeps running on the old one until it restarts. Declaring this
       * `live` would be the most convincing kind of wrong: the panel would say
       * it worked and the server would disagree.
       *
       * The agent passes this at spawn only when a host has actually chosen
       * one, so a room nobody has touched still starts exactly as it always
       * did. That does mean 20 is what the panel shows before anyone sets it —
       * ET:Legacy's own default for a dedicated server, worth confirming on
       * the pinned build.
       */
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Teeworlds.
 *
 * The richest recipe in the tree and the clearest case for this schema: the
 * agent writes a whole config file for every room and every value in it is a
 * literal — `sv_map dm1`, `sv_gametype dm`, `sv_max_clients 16`,
 * `sv_scorelimit 20`, `sv_timelimit 10`. See `prepareSpawn` for teeworlds in
 * platform/game-host/recipes.js; these defaults are those lines.
 *
 * The server reads that file once at startup, so everything restarts. Teeworlds
 * has an econ console that could change this live, which nothing implements
 * yet — hence no controlChannel rather than a claim.
 */
const TEEWORLDS: ServerSettingProfile = {
  slug: "teeworlds",
  settings: [
    {
      key: "sv_map",
      label: "Map",
      feature: "map",
      type: "string",
      default: "dm1",
      apply: "restart",
      backend: "config-file",
      help: "Must be a map the server build already has.",
    },
    {
      key: "sv_gametype",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: "dm",
      // The four modes stock Teeworlds ships.
      options: [
        { value: "dm", label: "Deathmatch" },
        { value: "tdm", label: "Team deathmatch" },
        { value: "ctf", label: "Capture the flag" },
      ],
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "sv_max_clients",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 16,
      min: 2,
      max: 64,
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "sv_scorelimit",
      label: "Score limit",
      type: "number",
      default: 20,
      min: 0,
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "sv_timelimit",
      label: "Time limit",
      feature: "timeLimit",
      type: "number",
      default: 10,
      min: 0,
      help: "Minutes. 0 for no limit.",
      apply: "restart",
      backend: "config-file",
    },
    {
      key: "sv_spectator_slots",
      label: "Spectator slots",
      type: "number",
      default: 0,
      min: 0,
      apply: "restart",
      backend: "config-file",
    },
  ],
};

/**
 * BZFlag.
 *
 * From the recipe's own argv: `-mp 8` is the slot count and `+s 10` the number
 * of super flags. `-offa` (open free-for-all) is the mode the agent picks, and
 * it is left out here rather than guessed at — the other modes take extra flags
 * this recipe does not pass, so offering them would spawn a server that does
 * not do what the label said.
 */
const BZFLAG: ServerSettingProfile = {
  slug: "bzflag",
  unavailable: {
    map: "BZFlag generates its world at start; a PlayBound room has no map list to choose from.",
  },
  settings: [
    {
      key: "maxPlayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      max: 200,
      apply: "restart",
      backend: "startup",
    },
    {
      key: "superFlags",
      label: "Super flags",
      type: "number",
      default: 10,
      min: 0,
      max: 100,
      help: "How many powerup flags spawn on the field.",
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * 0 A.D.
 *
 * `-autostart=random/mainland` and `-autostart-host-players` are already in the
 * recipe, and the player count is already derived rather than fixed — this
 * declares what was being derived. The map list is the stock random scripts;
 * a scenario map would need a different autostart path, so only the random ones
 * are offered.
 */
const ZERO_AD: ServerSettingProfile = {
  slug: "0ad",
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "enum",
      default: "random/mainland",
      options: [
        { value: "random/mainland", label: "Mainland" },
        { value: "random/continent", label: "Continent" },
        { value: "random/islands", label: "Islands" },
        { value: "random/lake", label: "Lake" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "maxPlayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      // The recipe already clamps to 8; the engine's own ceiling is the same.
      max: 8,
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Unvanquished.
 *
 * `+map plat23` is the recipe's literal. Daemon is a Quake 3 derivative and
 * takes rcon, which nothing wires up yet — declaring the channel without the
 * plumbing would have the panel offer live changes that go nowhere.
 */
const UNVANQUISHED: ServerSettingProfile = {
  slug: "unvanquished",
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "enum",
      default: "plat23",
      // The maps that ship with the game.
      options: [
        { value: "plat23", label: "Platform 23" },
        { value: "station15", label: "Station 15" },
        { value: "vega", label: "Vega" },
        { value: "parpax", label: "Parpax" },
        { value: "chasm", label: "Chasm" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "sv_maxclients",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 20,
      min: 2,
      max: 64,
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Freeciv.
 *
 * Assessed and deliberately empty. A Freeciv game generates one map at the
 * start and plays it to the end — "next map" is not a thing the game has, so
 * the control everyone reaches for first cannot exist here at any price.
 *
 * A profile with no settings is worth writing anyway. Without it Freeciv looks
 * exactly like a game nobody has got round to, and someone eventually spends a
 * day discovering what this comment says. Declaring what a game cannot do is
 * as much a result as declaring what it can.
 */
const FREECIV: ServerSettingProfile = {
  slug: "freeciv",
  unavailable: {
    map: "A Freeciv game is played on one map generated at the start; there is no next map to pick.",
    gameMode: "Rules are chosen when the game is created and cannot be swapped mid-game.",
  },
  settings: [],
};

/**
 * OpenArena.
 *
 * A Quake 3 engine, so it takes rcon on its own port exactly as ET does, and
 * the agent's recipe now generates a password for it. The gametype numbers are
 * OpenArena's own, which extend the original list past 4.
 *
 * No map control. Quake 3 changes maps with a `map <name>` command, which this
 * schema only allows from a declared option list, and OpenArena's map set
 * varies by install — the base game, the mission packs, and whatever pk3s a
 * server happens to carry. Guessing that list is a room that fails to spawn,
 * so `map` stays unassessed rather than wrong.
 */
const OPENARENA: ServerSettingProfile = {
  slug: "openarena",
  controlChannel: "rcon-quake3",
  settings: [
    {
      key: "g_gametype",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: 0,
      options: [
        { value: 0, label: "Free for all" },
        { value: 1, label: "Tournament" },
        { value: 3, label: "Team deathmatch" },
        { value: 4, label: "Capture the flag" },
        { value: 8, label: "Elimination" },
        { value: 10, label: "Last man standing" },
        { value: 12, label: "Domination" },
      ],
      // Latched to the map, like every Quake 3 gametype.
      apply: "next-round",
      backend: "rcon",
    },
    {
      key: "fraglimit",
      label: "Frag limit",
      type: "number",
      default: 20,
      min: 0,
      help: "0 for no limit.",
      apply: "live",
      backend: "rcon",
    },
    {
      key: "timelimit",
      label: "Time limit",
      feature: "timeLimit",
      type: "number",
      default: 0,
      min: 0,
      help: "Minutes. 0 for no limit.",
      apply: "live",
      backend: "rcon",
    },
    {
      key: "g_friendlyFire",
      label: "Friendly fire",
      feature: "friendlyFire",
      type: "boolean",
      default: false,
      apply: "live",
      backend: "rcon",
    },
    {
      key: "sv_maxclients",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 16,
      min: 2,
      max: 64,
      // Latched in the Quake 3 engine — see the same note on ET.
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Xonotic.
 *
 * DarkPlaces rather than Quake 3, and the cvar names differ enough to matter:
 * slots are `maxplayers`, not `sv_maxclients`, and the limits are the
 * `_override` variants because the plain ones apply only to a match already in
 * progress. All from the project's own server.cfg.
 *
 * Delivered at startup rather than over a channel. DarkPlaces does speak rcon,
 * but not the handshake the agent implements, and claiming a live apply we
 * cannot make would be worse than a restart.
 */
const XONOTIC: ServerSettingProfile = {
  slug: "xonotic",
  settings: [
    {
      key: "gametype",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: "dm",
      options: [
        { value: "dm", label: "Deathmatch" },
        { value: "tdm", label: "Team deathmatch" },
        { value: "ctf", label: "Capture the flag" },
        { value: "ca", label: "Clan arena" },
        { value: "ft", label: "Freeze tag" },
        { value: "lms", label: "Last man standing" },
        { value: "duel", label: "Duel" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "maxplayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      max: 64,
      apply: "restart",
      backend: "startup",
    },
    {
      key: "fraglimit_override",
      label: "Frag limit",
      type: "number",
      default: -1,
      min: -1,
      help: "-1 leaves each map's own limit alone.",
      apply: "restart",
      backend: "startup",
    },
    {
      key: "timelimit_override",
      label: "Time limit",
      feature: "timeLimit",
      type: "number",
      default: -1,
      min: -1,
      help: "Minutes. -1 leaves each map's own limit alone.",
      apply: "restart",
      backend: "startup",
    },
    {
      key: "minplayers",
      label: "Bots fill to",
      feature: "bots",
      type: "number",
      default: 0,
      min: 0,
      max: 32,
      help: "Bots join until this many players are in the game. 0 for none.",
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Team Fortress 2, and Counter-Strike 2 below it.
 *
 * Both are `+map` and `+maxplayers` literals already in their recipes. The map
 * lists are the stock rotations that ship with each game; a server carrying
 * custom content has more, which is a case for the map entity rather than for
 * a longer guess here.
 *
 * Source takes rcon and nothing wires it up, so these restart.
 */
const TEAM_FORTRESS_2: ServerSettingProfile = {
  slug: "team-fortress-2",
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "enum",
      default: "ctf_2fort",
      options: [
        { value: "ctf_2fort", label: "2Fort" },
        { value: "cp_dustbowl", label: "Dustbowl" },
        { value: "cp_gravelpit", label: "Gravel Pit" },
        { value: "cp_badlands", label: "Badlands" },
        { value: "pl_goldrush", label: "Gold Rush" },
        { value: "pl_upward", label: "Upward" },
        { value: "koth_viaduct", label: "Viaduct" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "maxplayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 24,
      min: 2,
      max: 32,
      apply: "restart",
      backend: "startup",
    },
  ],
};

const COUNTER_STRIKE_2: ServerSettingProfile = {
  slug: "counter-strike-2",
  settings: [
    {
      key: "map",
      label: "Map",
      feature: "map",
      type: "enum",
      default: "de_dust2",
      options: [
        { value: "de_dust2", label: "Dust II" },
        { value: "de_mirage", label: "Mirage" },
        { value: "de_inferno", label: "Inferno" },
        { value: "de_nuke", label: "Nuke" },
        { value: "de_overpass", label: "Overpass" },
        { value: "de_ancient", label: "Ancient" },
        { value: "de_anubis", label: "Anubis" },
        { value: "de_vertigo", label: "Vertigo" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "maxplayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 16,
      min: 2,
      max: 64,
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * BombSquad.
 *
 * Its argv is positional — port, name, player cap, party id — so the cap is the
 * only value there that is a setting rather than identity. The recipe already
 * clamps it to eight, which is the ceiling the official headless server takes.
 */
const BOMBSQUAD: ServerSettingProfile = {
  slug: "bombsquad",
  settings: [
    {
      key: "maxPlayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      max: 8,
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * OpenRA, and OpenHV below it on the same engine.
 *
 * `Server.EnableSingleplayer=False` is already in the recipe; `Server.LockBots`
 * is the other setting a dedicated server takes that a party would reach for.
 *
 * Two absences are deliberate. `Server.Password` would lock out the party it is
 * shown to, since the launcher's connect args carry none — the same reason ET
 * has no password control. And `Server.Map` takes a map *hash* produced by
 * OpenRA's own utility rather than a name anyone could pick off a list, which
 * is precisely the job a GameMap entity exists to do; until then map stays
 * unassessed rather than wrong.
 */
const OPENRA: ServerSettingProfile = {
  slug: "openra",
  unavailable: {
    password: "A server password would lock out the party, whose connect args carry none.",
  },
  settings: [
    {
      key: "Server.EnableSingleplayer",
      label: "Allow playing alone against bots",
      type: "boolean",
      default: false,
      apply: "restart",
      backend: "startup",
    },
    {
      key: "Server.LockBots",
      label: "Lock bots out of the lobby",
      feature: "bots",
      type: "boolean",
      default: false,
      apply: "restart",
      backend: "startup",
    },
  ],
};

const OPENHV: ServerSettingProfile = { ...OPENRA, slug: "openhv" };

/**
 * Games assessed as having no map or mode to choose.
 *
 * Each generates or carries a single world, so "next map" is not a control
 * they are missing — it is a control they cannot have. Recording it is the
 * point: without these rows each looks exactly like a game nobody has reached.
 */
const OPENTTD: ServerSettingProfile = {
  slug: "openttd",
  unavailable: {
    map: "OpenTTD generates its landscape when the game starts and plays it to the end.",
    gameMode: "Settings are chosen at game creation and cannot be swapped mid-game.",
  },
  settings: [],
};

const LUANTI: ServerSettingProfile = {
  slug: "luanti",
  unavailable: {
    map: "A Luanti server hosts one persistent world; there is no next map.",
    gameMode: "The game is fixed when the world is created.",
  },
  settings: [],
};

const VELOREN: ServerSettingProfile = {
  slug: "veloren",
  unavailable: {
    map: "Veloren hosts one persistent world.",
    gameMode: "A persistent RPG world has no modes to switch between.",
  },
  settings: [],
};

const ZERO_K: ServerSettingProfile = {
  slug: "zero-k",
  unavailable: {
    map: "Zero-K battles are configured in the lobby, not on the server.",
    gameMode: "Zero-K battles are configured in the lobby, not on the server.",
  },
  settings: [],
};

/**
 * Freedoom — which in multiplayer means Zandronum.
 *
 * Freedoom is the game data; the server that hosts it is a source port, and
 * the default edition in editions.ts is `zandronum`, so these are Zandronum's
 * cvars. They are passed as `+name value`, which is the form the recipe
 * already uses for `+sv_hostname`.
 *
 * `sv_maxclients` and `sv_maxplayers` are both real and both offered, because
 * they are not the same thing: clients over the player limit spectate rather
 * than being turned away, which is how a party watches a duel.
 *
 * Game mode is an enum of Zandronum's mode cvars rather than a single value,
 * because that is how the engine models it — `ctf 1`, `teamplay 1`, and so on,
 * with cooperative being the absence of all of them. The recipe turns the
 * chosen name into the right flag; the schema should not have to know that a
 * mode is spelled as a boolean.
 *
 * No map control. Phase 1 names its maps `E1M1` and Phase 2 names them `MAP01`,
 * and the recipe already branches on edition to pick the IWAD — so the option
 * list depends on which Freedoom this is, which the schema has no way to say.
 * That is a GameMap entity's job.
 *
 * Chocolate Doom, one of the seven binaries the recipe can land on, takes none
 * of this. It gets the plain args it always did.
 */
const FREEDOOM: ServerSettingProfile = {
  slug: "freedoom",
  settings: [
    {
      key: "gameMode",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: "coop",
      options: [
        { value: "coop", label: "Cooperative" },
        { value: "deathmatch", label: "Deathmatch" },
        { value: "teamplay", label: "Team deathmatch" },
        { value: "ctf", label: "Capture the flag" },
        { value: "duel", label: "Duel" },
        { value: "lastmanstanding", label: "Last man standing" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "sv_maxplayers",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      max: 32,
      apply: "restart",
      backend: "startup",
    },
    {
      key: "sv_maxclients",
      label: "Connection slots",
      type: "number",
      default: 16,
      min: 2,
      max: 64,
      help: "Anyone past the player limit joins as a spectator.",
      apply: "restart",
      backend: "startup",
    },
    {
      key: "fraglimit",
      label: "Frag limit",
      type: "number",
      default: 0,
      min: 0,
      help: "0 for no limit.",
      apply: "restart",
      backend: "startup",
    },
    {
      key: "timelimit",
      label: "Time limit",
      feature: "timeLimit",
      type: "number",
      default: 0,
      min: 0,
      help: "Minutes. 0 for no limit.",
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Servers that relay a game rather than run one.
 *
 * Each of these hosts the connection and nothing else: the match itself is set
 * up by a player, in the game, after everyone has arrived. wesnothd is a lobby
 * that Wesnoth clients create games inside; hedgewars-server carries rooms
 * whose owner picks the map and scheme in the game's own room screen; fgms
 * forwards position packets between aircraft and has no notion of a match at
 * all.
 *
 * So these are not games waiting for someone to declare their settings. They
 * are games where the server genuinely has none, and saying so is the result.
 */
const BATTLE_FOR_WESNOTH: ServerSettingProfile = {
  slug: "battle-for-wesnoth",
  unavailable: {
    map: "wesnothd is a lobby; the scenario is chosen by whoever creates the game inside it.",
    gameMode: "Game settings belong to the game a player creates in the lobby, not to the server.",
    slots: "Player count comes from the scenario the host picks.",
  },
  settings: [],
};

const HEDGEWARS: ServerSettingProfile = {
  slug: "hedgewars",
  unavailable: {
    map: "The room owner picks the map in Hedgewars' own room screen.",
    gameMode: "Schemes and weapon sets are chosen per room inside the game.",
  },
  settings: [],
};

const FLIGHTGEAR: ServerSettingProfile = {
  slug: "flightgear",
  unavailable: {
    map: "fgms relays aircraft positions; everyone flies their own scenery and there is no shared map to set.",
    gameMode: "There is no match — pilots simply share the sky.",
    slots: "fgms does not cap participants the way a match server does.",
  },
  settings: [],
};

/**
 * SuperTuxKart.
 *
 * The server takes these on the command line — `--mode`, `--difficulty`,
 * `--max-players` — alongside the `--lan-server` and `--port` the recipe
 * already passes. The mode numbers are the ones in stk-code's
 * `server_config.hpp`: the grand-prix variants are 0 and 1, their single-race
 * equivalents 3 and 4, and 6, 7 and 8 are the non-racing modes.
 *
 * Each is passed only once a host has chosen it, so a room nobody has touched
 * starts exactly as it always did. The values shown before then are
 * SuperTuxKart's own defaults and are worth confirming against the build on
 * the VPS.
 */
const SUPERTUXKART: ServerSettingProfile = {
  slug: "supertuxkart",
  settings: [
    {
      key: "mode",
      label: "Game mode",
      feature: "gameMode",
      type: "enum",
      default: 3,
      options: [
        { value: 3, label: "Race" },
        { value: 4, label: "Time trial" },
        { value: 0, label: "Grand prix" },
        { value: 1, label: "Grand prix time trial" },
        { value: 6, label: "Soccer" },
        { value: 7, label: "Free for all" },
        { value: 8, label: "Capture the flag" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "difficulty",
      label: "Difficulty",
      type: "enum",
      default: 1,
      options: [
        { value: 0, label: "Novice" },
        { value: 1, label: "Intermediate" },
        { value: 2, label: "Expert" },
        { value: 3, label: "SuperTux" },
      ],
      apply: "restart",
      backend: "startup",
    },
    {
      key: "max-players",
      label: "Player slots",
      feature: "slots",
      type: "number",
      default: 8,
      min: 2,
      max: 12,
      help: "Above 8 the server's own docs warn about performance.",
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Space Station 14.
 *
 * RobustToolbox takes any CVar as `--cvar name=value` at startup, which
 * overrides both the defaults and anything in a config file — so these need no
 * config file written for them, only argv the recipe already builds.
 *
 * `game.soft_max_players` is soft on purpose: it is the number reported to the
 * server list rather than a hard gate, which is why it is labelled as a target
 * rather than a limit.
 *
 * No map control. SS14 rotates maps between rounds by its own rules, and the
 * station a round runs on is not a thing a party sets before it starts.
 */
const SPACE_STATION_14: ServerSettingProfile = {
  slug: "space-station-14",
  unavailable: {
    map: "SS14 picks each round's station itself; there is no map for a party to set.",
  },
  settings: [
    {
      key: "game.soft_max_players",
      label: "Player target",
      feature: "slots",
      type: "number",
      default: 24,
      min: 2,
      max: 128,
      help: "Reported to the server list. Not a hard cap.",
      apply: "restart",
      backend: "startup",
    },
    {
      key: "game.lobbyenabled",
      label: "Start in a lobby",
      type: "boolean",
      default: true,
      help: "Off drops players straight into a round.",
      apply: "restart",
      backend: "startup",
    },
  ],
};

/**
 * Games whose match is set up inside the game, after everyone arrives.
 *
 * Re-Volt runs with `-lobby`, so the track and race settings belong to the
 * lobby rather than the server; its only other server flags are a port and a
 * password. TripleA is turn-based and the host chooses the game itself once
 * connected. YSoccer's own adapter row says as much — "wait for the online
 * lobby to load after connect", then pick a side. Hurry Curry's twenty-odd
 * restaurant layouts are chosen by the players, and its server flags are a
 * listen address, a name and whether to register publicly.
 *
 * A password comes up in several of these and is refused in all of them for
 * the same reason it is refused everywhere else: the launcher's connect args
 * carry none, so setting one locks the party out of its own room.
 */
const RE_VOLT: ServerSettingProfile = {
  slug: "re-volt-rvgl",
  unavailable: {
    map: "The track is picked in the lobby, which is where a -lobby server puts everyone.",
    gameMode: "Race settings belong to the lobby rather than to the server.",
    password: "A session password would lock out the party, whose connect args carry none.",
  },
  settings: [],
};

const TRIPLEA: ServerSettingProfile = {
  slug: "triplea",
  unavailable: {
    map: "TripleA's host picks the game and map after connecting, not on the server.",
    gameMode: "Rules come from the game file the host chooses.",
  },
  settings: [],
};

const YSOCCER: ServerSettingProfile = {
  slug: "ysoccer",
  unavailable: {
    map: "Teams and stadium are chosen in the online lobby once everyone has connected.",
    gameMode: "Match settings belong to the lobby.",
  },
  settings: [],
};

const HURRY_CURRY: ServerSettingProfile = {
  slug: "hurry-curry",
  unavailable: {
    map: "Players choose the restaurant layout in the game; the server takes an address and a name.",
    gameMode: "Hurry Curry is cooperative only.",
  },
  settings: [],
};

export const SERVER_SETTING_PROFILES: Readonly<Record<string, ServerSettingProfile>> = {
  "warzone-2100": WARZONE_2100,
  "wolfenstein-enemy-territory": WOLFENSTEIN_ENEMY_TERRITORY,
  freeciv: FREECIV,
  teeworlds: TEEWORLDS,
  bzflag: BZFLAG,
  "0ad": ZERO_AD,
  unvanquished: UNVANQUISHED,
  openarena: OPENARENA,
  xonotic: XONOTIC,
  "team-fortress-2": TEAM_FORTRESS_2,
  "counter-strike-2": COUNTER_STRIKE_2,
  bombsquad: BOMBSQUAD,
  openra: OPENRA,
  openhv: OPENHV,
  openttd: OPENTTD,
  luanti: LUANTI,
  veloren: VELOREN,
  "zero-k": ZERO_K,
  freedoom: FREEDOOM,
  "battle-for-wesnoth": BATTLE_FOR_WESNOTH,
  hedgewars: HEDGEWARS,
  flightgear: FLIGHTGEAR,
  // The agent spells 0 A.D. with a hyphen; both must resolve.
  supertuxkart: SUPERTUXKART,
  "space-station-14": SPACE_STATION_14,
  "re-volt-rvgl": RE_VOLT,
  triplea: TRIPLEA,
  ysoccer: YSOCCER,
  "hurry-curry": HURRY_CURRY,
  "0-ad": ZERO_AD,
};

export function getServerSettingProfile(
  slug: string | null | undefined
): ServerSettingProfile | null {
  if (!slug) return null;
  return SERVER_SETTING_PROFILES[slug] ?? null;
}

/** Every declared default for a game, ready to hand an adapter. */
export function defaultSettingValues(slug: string): ServerSettingValues {
  const profile = getServerSettingProfile(slug);
  if (!profile) return {};
  const values: ServerSettingValues = {};
  for (const setting of profile.settings) values[setting.key] = setting.default;
  return values;
}

const APPLY_COST: Record<ApplyMode, number> = { live: 0, "next-round": 1, restart: 2 };

/**
 * The worst apply mode among the keys being changed — what the host must be
 * warned about. Changing friendly fire and max players together restarts the
 * server, so the whole save has to be presented as a restart.
 *
 * Unknown keys are ignored rather than treated as free: they cannot reach an
 * adapter, because coerceSettingValues drops them first.
 */
export function strongestApplyMode(slug: string, keys: readonly string[]): ApplyMode | null {
  const profile = getServerSettingProfile(slug);
  if (!profile) return null;
  let worst: ApplyMode | null = null;
  for (const key of keys) {
    const setting = profile.settings.find((s) => s.key === key);
    if (!setting) continue;
    if (!worst || APPLY_COST[setting.apply] > APPLY_COST[worst]) worst = setting.apply;
  }
  return worst;
}

/**
 * Keep only values this game declares, of the declared type and within the
 * declared bounds.
 *
 * These values end up in a file a game server parses on a machine we run, so
 * the schema is the boundary: anything undeclared is dropped, never passed
 * through. Rejections are returned rather than thrown so a form can show them
 * all at once instead of one per save.
 */
export function coerceSettingValues(
  slug: string,
  input: Record<string, unknown>
): { values: ServerSettingValues; rejected: { key: string; reason: string }[] } {
  const profile = getServerSettingProfile(slug);
  const values: ServerSettingValues = {};
  const rejected: { key: string; reason: string }[] = [];
  if (!profile) return { values, rejected };

  for (const [key, raw] of Object.entries(input)) {
    const setting = profile.settings.find((s) => s.key === key);
    if (!setting) {
      rejected.push({ key, reason: "not a setting this game declares" });
      continue;
    }

    if (setting.type === "boolean") {
      if (typeof raw !== "boolean") rejected.push({ key, reason: "expected true or false" });
      else values[key] = raw;
      continue;
    }

    if (setting.type === "number") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        rejected.push({ key, reason: "expected a number" });
      } else if (setting.min !== undefined && raw < setting.min) {
        rejected.push({ key, reason: `minimum is ${setting.min}` });
      } else if (setting.max !== undefined && raw > setting.max) {
        rejected.push({ key, reason: `maximum is ${setting.max}` });
      } else {
        values[key] = raw;
      }
      continue;
    }

    if (setting.type === "string") {
      if (typeof raw !== "string") {
        rejected.push({ key, reason: "expected text" });
      } else if (setting.maxLength !== undefined && raw.length > setting.maxLength) {
        rejected.push({ key, reason: `longer than ${setting.maxLength} characters` });
      } else {
        values[key] = raw;
      }
      continue;
    }

    if (setting.options.some((o) => o.value === raw)) {
      values[key] = raw as ServerSettingValue;
    } else {
      rejected.push({ key, reason: "not one of the allowed options" });
    }
  }

  return { values, rejected };
}

/**
 * Where a game stands on each control concept.
 *
 * Three answers, and the middle one is the reason this exists:
 *
 * - `supported` — a setting implements it, and `apply` says what it costs
 * - `unavailable` — the game cannot have it, with the reason on the record
 * - `unassessed` — nobody has looked yet
 *
 * "Not supported" collapses the last two, and they are opposite instructions
 * to whoever reads them next: one is finished work, the other is a to-do.
 */
export type ControlFeatureSupport =
  | { feature: ControlFeature; label: string; status: "supported"; key: string; apply: ApplyMode }
  | { feature: ControlFeature; label: string; status: "unavailable"; reason: string }
  | { feature: ControlFeature; label: string; status: "unassessed" };

const CONTROL_FEATURES = Object.keys(CONTROL_FEATURE_LABELS) as ControlFeature[];

export function controlFeatureSupport(slug: string): ControlFeatureSupport[] {
  const profile = getServerSettingProfile(slug);
  return CONTROL_FEATURES.map((feature): ControlFeatureSupport => {
    const label = CONTROL_FEATURE_LABELS[feature];
    const setting = profile?.settings.find((s) => s.feature === feature);
    if (setting) {
      return { feature, label, status: "supported", key: setting.key, apply: setting.apply };
    }
    const reason = profile?.unavailable?.[feature];
    if (reason) return { feature, label, status: "unavailable", reason };
    return { feature, label, status: "unassessed" };
  });
}

/**
 * Games that support a concept, for the cross-game question this vocabulary
 * exists to answer — "which of these can switch maps?"
 */
export function gamesSupporting(feature: ControlFeature): string[] {
  return Object.keys(SERVER_SETTING_PROFILES).filter((slug) =>
    SERVER_SETTING_PROFILES[slug].settings.some((s) => s.feature === feature)
  );
}
