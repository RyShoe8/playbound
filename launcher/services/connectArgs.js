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
const CLIENT_CONNECT_ARGS = {
  // OpenRA reads Launch.Connect from its settings-style argv. `Game.Connect`,
  // which the catalog recipe used to carry, is not a setting OpenRA defines, so
  // it was parsed as unknown and the game opened on the main menu instead.
  openra: ["Launch.Connect={host}:{port}"],
  openttd: ["-n", "{host}:{port}"],
  luanti: ["--go", "--address", "{host}", "--port", "{port}"],
  // Without --autoconnect the GTK client only pre-fills the connect dialog
  // (or ignores the address on the start screen) and both players sit in
  // single-player instead of the party dedicated server.
  freeciv: ["--autoconnect", "--server", "{host}", "--port", "{port}"],
  supertuxkart: ["--connect-now={host}:{port}"],
  bzflag: ["{host}:{port}"],
  // Quake-lineage engines all inherit the same console command.
  xonotic: ["+connect", "{host}:{port}"],
  openarena: ["+connect", "{host}:{port}"],
  unvanquished: ["+connect", "{host}:{port}"],

  // Source engine (Half-Life 2 branch) uses the same +connect console command
  // as the id Tech games above. GoldenEye: Source is a Source SDK Base 2007
  // mod installed to Steam\steamapps\sourcemods\gesource — Steam launches it,
  // so this is what playGame's client-connect override appends.
  "goldeneye-source": ["+connect", "{host}:{port}"],

  // RTS / Turn-based & Classic Engines
  "battle-for-wesnoth": ["--host", "{host}:{port}"],
  "0-ad": ["-autostart={host}:{port}"],
  "warzone-2100": ["--connect={host}:{port}"],
  keeperfx: ["-connect", "{host}:{port}"],
  "marathon-2": ["-connect", "{host}:{port}"],
  "aleph-one": ["-connect", "{host}:{port}"],
  freedoom: ["-connect", "{host}:{port}"],
  triplea: ["-Dserver.address={host}", "-Dserver.port={port}"],

  // Mindustry takes `ip:port` as argv (same as the catalog recipe). Without
  // this, playGame's client-connect override launched the vanilla client.
  mindustry: ["{host}:{port}"],
  ysoccer: ["--connect={host}", "--tcp-port={port}", "--udp-port={port}"],

  // In-game Room Code / Lobby Joins — no CLI join; show host:port to paste.
  holocure: null,
  hedgewars: null,
  bombsquad: null,
  wolfenstein: ["--join", "{host}:{port}"],
};

/** Templates for a slug, or null when the client cannot join from the CLI. */
function clientConnectArgs(slug) {
  const key = String(slug || "");
  if (!Object.prototype.hasOwnProperty.call(CLIENT_CONNECT_ARGS, key)) return undefined;
  return CLIENT_CONNECT_ARGS[key];
}

/** True when this slug's connect syntax is owned here rather than by the catalog. */
function hasClientConnectArgs(slug) {
  return Object.prototype.hasOwnProperty.call(CLIENT_CONNECT_ARGS, String(slug || ""));
}

/** True when we know the client offers no command-line join. */
function joinsFromInGameMenu(slug) {
  return hasClientConnectArgs(slug) && clientConnectArgs(slug) === null;
}

function applyConnectTemplates(templates, join) {
  return templates.map((template) =>
    String(template)
      .replaceAll("{host}", join.host)
      .replaceAll("{port}", String(join.port))
      .replaceAll("{name}", join.name || "")
      // OpenRA needs the mod named or it joins with whatever it last had open.
      .replaceAll("{mod}", join.mod || "")
  );
}

const TEMPLATE_TOKEN = /\{(host|port|name|mod)\}/;

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
  clientConnectArgs,
  hasClientConnectArgs,
  joinsFromInGameMenu,
  applyConnectTemplates,
  staticLaunchArgs,
};
