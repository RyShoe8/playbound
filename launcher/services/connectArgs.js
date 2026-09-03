/**
 * Client-side connect syntax for the games PlayBound hosts dedicated servers
 * for. The server half of this lives in platform/game-host/recipes.js — keep
 * the slugs in sync with it and with platform/src/lib/gameHost/catalog.ts.
 *
 * Why this exists rather than relying on the catalog's `launcherInstall.connectArgs`:
 *
 *   1. The launcher stores connectArgs into the local install record when a
 *      game is installed, and prefers that copy. A catalog correction therefore
 *      would not reach anyone who already installed the game.
 *   2. Connect syntax is a property of the client build the launcher installs,
 *      not curated catalog content, and it has to be right or "Join Game" on a
 *      party silently drops the player at the game's main menu.
 *
 * So for these slugs the launcher is authoritative. Everything else still takes
 * its connectArgs from the install record or the catalog, unchanged.
 */

/**
 * `null` means the client has no command-line join: the player has to enter the
 * address in-game. Those are listed deliberately so callers can tell "we do not
 * support this" apart from "we have not got to it yet", and show the address.
 */
function openRaModName(editionSlug) {
  const raw = String(editionSlug || "").toLowerCase();
  if (raw.includes("cnc") || raw.includes("tiberian") || raw === "td") return "cnc";
  if (raw.includes("d2k") || raw.includes("dune")) return "d2k";
  if (raw.includes("combined") || raw.includes("ca")) return "ca";
  if (raw.includes("openhv") || raw === "hv") return "hv";
  if (raw.includes("ra2")) return "ra2";
  return "ra";
}

const CLIENT_CONNECT_ARGS = {
  // OpenRA reads Launch.Connect from its settings-style argv along with Game.Mod.
  // Without Game.Mod={mod}, OpenRA starts in modchooser or whatever mod was last open
  // and the handshake fails with "Server is running an incompatible mod".
  openra: ["Game.Mod={mod}", "Launch.Connect={host}:{port}"],
  // OpenHV is the same engine under a different mod, and its own spawn
  // recipe passes Game.Mod=hv. Without an entry here a room PlayBound
  // provisions had no client join at all: the catalog record carries no
  // connectArgs for it either.
  openhv: ["Game.Mod=hv", "Launch.Connect={host}:{port}"],
  // The client takes console commands as argv, quoted as one token.
  teeworlds: ['"connect {host}:{port}"'],
  /*
   * BombSquad prompts for the address in-game — its adapter row says so
   * with inGameJoinPrompt. Declared null rather than left out, so this
   * reads as "there is no CLI join" instead of "nobody has got to it".
   */
  bombsquad: null,
  /*
   * id Tech 3, so the join is the Quake 3 one — which the adapter row has
   * always declared. It simply never reached this file, and the catalog
   * record carries no connectArgs either, so a provisioned room could only
   * be joined by pasting the address in by hand.
   */
  "medal-of-honor-allied-assault": ["+connect", "{host}:{port}"],
  openttd: ["-n", "{host}:{port}"],
  luanti: ["--go", "--address", "{host}", "--port", "{port}"],
  // Without --autoconnect the GTK client only pre-fills the connect dialog
  // (or ignores the address on the start screen) and both players sit in
  // single-player instead of the party dedicated server.
  freeciv: ["--autoconnect", "--server", "{host}", "--port", "{port}"],
  bzflag: ["{host}:{port}"],
  // Quake-lineage engines all inherit the same console command.
  xonotic: ["+connect", "{host}:{port}"],
  openarena: ["+connect", "{host}:{port}"],
  unvanquished: ["+connect", "{host}:{port}"],

  // RTS / Turn-based & Classic Engines
  "battle-for-wesnoth": ["--host", "{host}:{port}"],
  "0-ad": ["-autostart={host}:{port}"],
  "0ad": ["-autostart={host}:{port}"],
  keeperfx: ["-connect", "{host}:{port}"],
  "marathon": ["-connect", "{host}:{port}"],
  "marathon-2": ["-connect", "{host}:{port}"],
  "marathon-infinity": ["-connect", "{host}:{port}"],
  "aleph-one": ["-connect", "{host}:{port}"],
  alephone: ["-connect", "{host}:{port}"],
  freedoom: ["-iwad", "{iwad}", "+connect", "{host}:{port}"],
  zandronum: ["-iwad", "{iwad}", "+connect", "{host}:{port}"],
  triplea: ["-Dserver.address={host}", "-Dserver.port={port}"],
  "space-station-14": ["--connect-address", "ss14://{host}:{port}"],
  veloren: ["--connect", "{host}:{port}"],
  "wolfenstein-enemy-territory": ["+connect", "{host}:{port}"],
  wolfenstein: ["--join", "{host}"],
  "beyond-all-reason": ["--connect={host}:{port}"],
  "zero-k": ["--connect={host}:{port}"],
  flightgear: ["--multiplay=out,10,{host},{port}"],
  mrboom: ["-c", "{host}"],
  
  // Third-party engines / Source Ports
  "the-ur-quan-masters": null,
  uqm: null,
  daggersfall: null,
  morrowind: ["--connect={host}:{port}"],
  tes3mp: ["--connect={host}:{port}"],

  // Source / Valve Engines
  "team-fortress-2": ["+connect", "{host}:{port}"],
  "counter-strike-2": ["+connect", "{host}:{port}"],
  "dota-2": ["+connect", "{host}:{port}"],

  // Mindustry takes `ip:port` as argv (same as the catalog recipe). Without
  // this, playGame's client-connect override launched the vanilla client.
  mindustry: ["{host}:{port}"],
  ysoccer: ["--connect={host}", "--tcp-port={port}", "--udp-port={port}"],
  "re-volt-rvgl": ["-lobby", "{host}:{port}"],
  revolt: ["-lobby", "{host}:{port}"],
  rvgl: ["-lobby", "{host}:{port}"],
  /*
   * OpenTyrian 2000 is symmetric peer-to-peer, not host/joiner: per the
   * engine's own --help, both players run `--net=HOST[:PORT]` pointed at each
   * other, at the same time, and take seats 1 and 2 via --net-player-number.
   * There is no server to connect to, so the seat cannot be hardcoded to 2 —
   * that had both sides claiming player 2. See SYMMETRIC_PEER_GAMES.
   */
  "opentyrian-2000": [
    "--net={host}:{port}",
    "--net-player-number={playerNumber}",
    "--net-player-name={name}",
  ],
  opentyrian: [
    "--net={host}:{port}",
    "--net-player-number={playerNumber}",
    "--net-player-name={name}",
  ],
  srb2: ["+connect", "{host}:{port}"],
  jfsw: ["-net", "{host}:{port}"],
  // Dune Legacy only accepts the server address from its Internet Game menu.
  "dune-legacy": null,
  // OpenMOHAA inherits the id Tech console-style direct connect command.
  openmohaa: ["+connect", "{host}:{port}"],

  /*
   * Hedgewars joins by URL, not by flag.
   *
   * There is no --connect: the shipped 1.0.0 frontend's entire long-option
   * list is --nick/--port/--fullscreen/… and nothing to name a server, so the
   * `["--connect", "{host}:{port}"]` the catalog recipe carried could never
   * have worked. What it does support is a positional hwplay:// URL —
   * "hwplay://<HOST>[:<PORT>]", per the project's HWPlaySchemeSyntax page —
   * which is exactly how its own web server list links work. Port is optional
   * and defaults to 46631, the same port the adapter already hosts on.
   *
   * This was previously null, meaning "paste the address in-game", which
   * worked but made joining a party manual for no reason.
   */
  hedgewars: ["hwplay://{host}:{port}"],

  // In-game Room Code / Lobby Joins / Direct Network — no CLI join; show host:port to paste.
  supertuxkart: null,
  holocure: null,
  "hurry-curry": null,
  openciv3: null,
  "dungeon-keeper-gold": null,
  starcraft: null,
  openlara: null,
};

const DEFAULT_GAME_PORTS = {
  openarena: 27960,
  "wolfenstein-enemy-territory": 27960,
  xonotic: 26000,
  freeciv: 5556,
  srb2: 5029,
  jfsw: 1997,
  "opentyrian-2000": 1333,
  opentyrian: 1333,
  openttd: 3979,
  openra: 1234,
  openhv: 1255,
  teeworlds: 8303,
  bombsquad: 43210,
  "medal-of-honor-allied-assault": 12203,
  luanti: 30000,
  mindustry: 6567,
  // Hedgewars' own default when an hwplay:// URL omits the port.
  hedgewars: 46631,
  /*
   * Hurry Curry's server is a WebSocket listener on 27032 (protocol.md
   * "Ports"); 8888 was never a port the game uses.
   */
  "hurry-curry": 27032,
  zandronum: 10666,
  freedoom: 10666,
  veloren: 14004,
  unvanquished: 27960,
  bzflag: 5154,
  keeperfx: 5555,
  triplea: 3303,
  "0ad": 20595,
  "0-ad": 20595,
  "dune-legacy": 28747,
  openmohaa: 12203,
};

function defaultGamePort(slug) {
  return DEFAULT_GAME_PORTS[String(slug || "").toLowerCase()] || 0;
}

/** Templates for a slug, or null when the client cannot join from the CLI. */
function clientConnectArgs(slug) {
  const key = String(slug || "");
  if (!Object.prototype.hasOwnProperty.call(CLIENT_CONNECT_ARGS, key)) return undefined;
  return CLIENT_CONNECT_ARGS[key];
}

/**
 * Games where both players connect to each other, rather than one hosting.
 *
 * The party model assumes a host: the leader launches plainly and everyone
 * else is handed its address. These games have no server — each side passes
 * the *other* side's address and a distinct seat number, simultaneously. Left
 * on the default path the leader launched with no network flags at all, so
 * the joiner dialled a peer that was never listening and both sat in
 * single-player.
 *
 * Membership means two things to the launch path: the leader also needs a
 * peer address, and the seat number comes from who is leader rather than
 * being fixed.
 */
const SYMMETRIC_PEER_GAMES = new Set(["opentyrian-2000", "opentyrian"]);

/** True when both sides dial each other instead of one hosting. */
function isSymmetricPeerGame(slug) {
  return SYMMETRIC_PEER_GAMES.has(String(slug || ""));
}

/** True when this slug's connect syntax is owned here rather than by the catalog. */
function hasClientConnectArgs(slug) {
  return Object.prototype.hasOwnProperty.call(CLIENT_CONNECT_ARGS, String(slug || ""));
}

/** True when we know the client offers no command-line join. */
function joinsFromInGameMenu(slug) {
  return hasClientConnectArgs(slug) && clientConnectArgs(slug) === null;
}

function freedoomIwadName(editionSlug) {
  const ed = String(editionSlug || "").toLowerCase();
  if (ed.includes("phase-1") || ed.includes("phase1") || ed === "1") return "freedoom1.wad";
  if (ed.includes("freedm") || ed.includes("dm")) return "freedm.wad";
  return "freedoom2.wad";
}

function applyConnectTemplates(templates, join, editionSlug) {
  const mod = join?.mod || openRaModName(editionSlug || join?.edition);
  const iwad = freedoomIwadName(editionSlug || join?.edition);
  return templates.map((template) =>
    String(template)
      .replaceAll("{host}", join?.host || "")
      .replaceAll("{port}", String(join?.port || ""))
      .replaceAll("{name}", join?.name || "")
      // OpenRA needs the mod named or it joins with whatever it last had open.
      .replaceAll("{mod}", mod || "ra")
      .replaceAll("{iwad}", iwad)
      /*
       * Which seat this player takes in a two-player peer game. Both sides run
       * the same command line except for this, and if they agree on it they
       * both pilot the same ship and neither sees the other. Defaults to 2,
       * the joining side, because that is the only case that existed before
       * peer games could be hosted from inside a party.
       */
      .replaceAll("{playerNumber}", String(join?.playerNumber || 2))
  );
}

const TEMPLATE_TOKEN = /\{(host|port|name|mod|playerNumber|iwad)\}/;

/**
 * Args to pass on a plain launch — one with no server to join.
 *
 * A connect list is a command line, not a bag of independent flags. Filtering
 * out only the elements containing a placeholder splits pairs: Unvanquished's
 * `["+connect", "{host}:{port}"]` became a bare `+connect`, and the engine
 * rejected it with `URL "+connect" contains forbidden character '+'`. Twelve
 * hosted games had the same shape — `-n`, `--host`, `-connect`, `--address`
 * — and only survived because their engines happen to ignore a dangling flag.
 *
 * So a list is all-or-nothing: if any element is templated the whole thing
 * belongs to joining and is dropped. Genuinely static args, like P99's
 * `patchme`, carry no placeholder and still apply.
 */
function staticLaunchArgs(connectArgs) {
  if (!Array.isArray(connectArgs) || connectArgs.length === 0) return [];
  if (connectArgs.some((t) => TEMPLATE_TOKEN.test(String(t)))) return [];
  return connectArgs.map(String);
}

module.exports = {
  CLIENT_CONNECT_ARGS,
  SYMMETRIC_PEER_GAMES,
  clientConnectArgs,
  hasClientConnectArgs,
  isSymmetricPeerGame,
  joinsFromInGameMenu,
  applyConnectTemplates,
  staticLaunchArgs,
  defaultGamePort,
};
