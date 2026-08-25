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
};

export const HOSTABLE_SLUGS = Object.keys(HOSTABLE_GAMES);

/**
 * Catalog slugs that differ from the slug the VPS knows the game by.
 *
 * 0 A.D. is published as `0ad`, while this catalog and the agent's recipes.js
 * both call it `0-ad`. provisionPartyHost looks the party's game up by its
 * catalog slug, so the lookup missed and every 0 A.D. party silently fell back
 * to no dedicated server — on a game the VPS was fully configured to run. The
 * server browser sidestepped it by registering its provider under `0ad`, which
 * is why the mismatch survived: servers listed fine, only hosting broke.
 *
 * Aliasing rather than renaming, because the agent on the box already answers
 * to `0-ad` and this is deployed by hand.
 */
const HOSTABLE_SLUG_ALIASES: Record<string, string> = {
  "0ad": "0-ad",
  etlegacy: "wolfenstein-enemy-territory",
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
