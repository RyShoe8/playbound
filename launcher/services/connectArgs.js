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
  return "ra";
}

const CLIENT_CONNECT_ARGS = {
  // OpenRA reads Launch.Connect from its settings-style argv along with Game.Mod.
  // Without Game.Mod={mod}, OpenRA starts in modchooser or whatever mod was last open
  // and the handshake fails with "Server is running an incompatible mod".
  openra: ["Game.Mod={mod}", "Launch.Connect={host}:{port}"],
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
  freedoom: ["+connect", "{host}:{port}"],
  triplea: ["-Dserver.address={host}", "-Dserver.port={port}"],
  "space-station-14": ["--connect-address", "ss14://{host}:{port}"],
  veloren: ["--connect", "{host}:{port}"],
  "wolfenstein-enemy-territory": ["+connect", "{host}:{port}"],
  "beyond-all-reason": ["--connect={host}:{port}"],
  "zero-k": ["--connect={host}:{port}"],
  flightgear: ["--multiplay=out,10,{host},{port}"],
  mrboom: ["-c", "{host}"],
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

  // In-game Room Code / Lobby Joins / Direct Network — no CLI join; show host:port to paste.
  holocure: null,
  hedgewars: null,
  openciv3: null,
  "dungeon-keeper-gold": null,
  starcraft: null,
  openlara: null,
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

function applyConnectTemplates(templates, join, editionSlug) {
  const mod = join?.mod || openRaModName(editionSlug || join?.edition);
  return templates.map((template) =>
    String(template)
      .replaceAll("{host}", join?.host || "")
      .replaceAll("{port}", String(join?.port || ""))
      .replaceAll("{name}", join?.name || "")
      // OpenRA needs the mod named or it joins with whatever it last had open.
      .replaceAll("{mod}", mod || "ra")
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
