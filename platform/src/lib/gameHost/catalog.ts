/**
 * Games that cannot reliably host from a home PC (inbound UDP / CGNAT).
 * PlayBound starts a dedicated process on the public VPS instead.
 *
 * Keep this list in sync with platform/game-host/recipes.js.
 */

export const HOSTED_STATUSES = ["none", "pending", "ready", "failed"] as const;
export type HostedStatus = (typeof HOSTED_STATUSES)[number];

export type HostableGame = {
  slug: string;
  title: string;
  /** Default listen port; the agent may assign another in the same range. */
  defaultPort: number;
  portEnd: number;
  protocol: "udp" | "tcp" | "both";
};

export const HOSTABLE_GAMES: Record<string, HostableGame> = {
  openra: {
    slug: "openra",
    title: "OpenRA",
    defaultPort: 1234,
    portEnd: 1250,
    /*
     * TCP. OpenRA's server is a TcpListener and clients connect to it over TCP;
     * the only UDP it speaks is the LAN discovery beacon, which is meaningless
     * on a public host. This said "udp", so the firewall opened UDP and dropped
     * every client's TCP handshake — the server came up fine and joining always
     * failed.
     */
    protocol: "tcp",
  },
  openttd: {
    slug: "openttd",
    title: "OpenTTD",
    defaultPort: 3979,
    portEnd: 3999,
    protocol: "both",
  },
  luanti: {
    slug: "luanti",
    title: "Luanti",
    defaultPort: 30000,
    portEnd: 30020,
    protocol: "udp",
  },
  mindustry: {
    slug: "mindustry",
    title: "Mindustry",
    defaultPort: 6567,
    portEnd: 6587,
    protocol: "both",
  },
  ysoccer: {
    slug: "ysoccer",
    title: "YSoccer",
    defaultPort: 54555,
    portEnd: 54575,
    protocol: "both",
  },
  hedgewars: {
    slug: "hedgewars",
    title: "Hedgewars",
    defaultPort: 46631,
    portEnd: 46650,
    protocol: "both",
  },
  "warzone-2100": {
    slug: "warzone-2100",
    title: "Warzone 2100",
    defaultPort: 2100,
    portEnd: 2120,
    protocol: "both",
  },
  freeciv: {
    slug: "freeciv",
    title: "Freeciv",
    defaultPort: 5556,
    portEnd: 5576,
    protocol: "tcp",
  },
  bzflag: {
    slug: "bzflag",
    title: "BZFlag",
    defaultPort: 5154,
    portEnd: 5174,
    protocol: "both",
  },
  supertuxkart: {
    slug: "supertuxkart",
    title: "SuperTuxKart",
    defaultPort: 2759,
    portEnd: 2779,
    protocol: "both",
  },
  xonotic: {
    slug: "xonotic",
    title: "Xonotic",
    defaultPort: 26000,
    portEnd: 26020,
    protocol: "udp",
  },
  openarena: {
    slug: "openarena",
    title: "OpenArena",
    defaultPort: 27960,
    portEnd: 27980,
    protocol: "udp",
  },
  triplea: {
    slug: "triplea",
    title: "TripleA",
    defaultPort: 3303,
    portEnd: 3323,
    protocol: "tcp",
  },
  "0-ad": {
    slug: "0-ad",
    title: "0 A.D.",
    defaultPort: 20595,
    portEnd: 20615,
    protocol: "udp",
  },
  bombsquad: {
    slug: "bombsquad",
    title: "BombSquad",
    defaultPort: 43210,
    portEnd: 43230,
    protocol: "udp",
  },
  "wolfenstein-enemy-territory": {
    slug: "wolfenstein-enemy-territory",
    title: "Wolfenstein: Enemy Territory",
    /*
     * Below OpenArena's 27960–27980 range so party rooms do not collide when
     * both idTech titles are hosted on the same VPS.
     */
    defaultPort: 27950,
    portEnd: 27959,
    protocol: "udp",
  },
  "team-fortress-2": {
    slug: "team-fortress-2",
    title: "Team Fortress 2",
    defaultPort: 27015,
    portEnd: 27025,
    protocol: "udp",
  },
  "counter-strike-2": {
    slug: "counter-strike-2",
    title: "Counter-Strike 2",
    defaultPort: 27030,
    portEnd: 27040,
    protocol: "udp",
  },
  unvanquished: {
    slug: "unvanquished",
    title: "Unvanquished",
    defaultPort: 27965,
    portEnd: 27975,
    protocol: "udp",
  },
  "battle-for-wesnoth": {
    slug: "battle-for-wesnoth",
    title: "The Battle for Wesnoth",
    defaultPort: 15000,
    portEnd: 15020,
    protocol: "tcp",
  },
  veloren: {
    slug: "veloren",
    title: "Veloren",
    defaultPort: 14004,
    portEnd: 14014,
    protocol: "both",
  },
  freedoom: {
    slug: "freedoom",
    title: "Freedoom",
    defaultPort: 10666,
    portEnd: 10686,
    protocol: "udp",
  },
  "space-station-14": {
    slug: "space-station-14",
    title: "Space Station 14",
    defaultPort: 1212,
    portEnd: 1222,
    protocol: "udp",
  },
  "zero-k": {
    slug: "zero-k",
    title: "Zero-K",
    defaultPort: 8452,
    portEnd: 8462,
    protocol: "udp",
  },
  flightgear: {
    slug: "flightgear",
    title: "FlightGear",
    defaultPort: 5000,
    portEnd: 5010,
    protocol: "udp",
  },
  openhv: {
    slug: "openhv",
    title: "OpenHV",
    defaultPort: 1255,
    portEnd: 1270,
    protocol: "tcp",
  },
  "re-volt-rvgl": {
    slug: "re-volt-rvgl",
    title: "Re-Volt (RVGL)",
    defaultPort: 2310,
    portEnd: 2330,
    protocol: "udp",
  },
  "chris-sawyers-locomotion": {
    slug: "chris-sawyers-locomotion",
    title: "Chris Sawyer's Locomotion",
    defaultPort: 2300,
    portEnd: 2320,
    protocol: "both",
  },
  "renegade-x": {
    slug: "renegade-x",
    title: "Renegade X",
    defaultPort: 7777,
    portEnd: 7797,
    protocol: "udp",
  },
  gemrb: {
    slug: "gemrb",
    title: "GemRB",
    defaultPort: 47624,
    portEnd: 47640,
    protocol: "tcp",
  },
  "wipeout-rewrite": {
    slug: "wipeout-rewrite",
    title: "wipEout Rewrite",
    defaultPort: 7000,
    portEnd: 7020,
    protocol: "udp",
  },
  exult: {
    slug: "exult",
    title: "Exult",
    defaultPort: 9999,
    portEnd: 10010,
    protocol: "both",
  },
  "hurry-curry": {
    slug: "hurry-curry",
    title: "Hurry Curry!",
    defaultPort: 8888,
    portEnd: 8900,
    protocol: "both",
  },
};

export const HOSTABLE_SLUGS = Object.keys(HOSTABLE_GAMES);

/**
 * Catalog slugs that differ from the slug the VPS knows the game by.
 */
const HOSTABLE_SLUG_ALIASES: Record<string, string> = {
  "0ad": "0-ad",
  etlegacy: "wolfenstein-enemy-territory",
  tf2: "team-fortress-2",
  cs2: "counter-strike-2",
  wesnoth: "battle-for-wesnoth",
  doom: "freedoom",
  ss14: "space-station-14",
  rvgl: "re-volt-rvgl",
  revolt: "re-volt-rvgl",
  locomotion: "chris-sawyers-locomotion",
  openloco: "chris-sawyers-locomotion",
  renegadex: "renegade-x",
  wipeout: "wipeout-rewrite",
};

export function isHostableGame(slug: string | null | undefined): boolean {
  return Boolean(slug && getHostableGame(slug));
}

export function getHostableGame(slug: string): HostableGame | null {
  if (!slug) return null;
  const direct = HOSTABLE_GAMES[slug];
  if (direct) return direct;
  const aliased = HOSTABLE_SLUG_ALIASES[slug];
  return aliased ? HOSTABLE_GAMES[aliased] || null : null;
}

export type PartyHostedPayload = {
  enabled: boolean;
  /** False when this deployment has no game-host credentials — rooms will never start. */
  configured?: boolean;
  status: HostedStatus;
  host: string | null;
  port: number | null;
  name: string | null;
  error: string | null;
  roomCode?: string | null;
  /** What the player still does in-game once Connect has joined them to the server. */
  steps?: string[];
};

export function emptyHostedPayload(slug: string): PartyHostedPayload {
  return {
    enabled: isHostableGame(slug),
    status: "none",
    host: null,
    port: null,
    name: null,
    error: null,
    roomCode: null,
  };
}
