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
    protocol: "udp",
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
  unvanquished: {
    slug: "unvanquished",
    title: "Unvanquished",
    defaultPort: 27990,
    portEnd: 28010,
    protocol: "udp",
  },
};

export const HOSTABLE_SLUGS = Object.keys(HOSTABLE_GAMES);

export function isHostableGame(slug: string | null | undefined): boolean {
  return Boolean(slug && HOSTABLE_GAMES[slug]);
}

export function getHostableGame(slug: string): HostableGame | null {
  return HOSTABLE_GAMES[slug] || null;
}

export type PartyHostedPayload = {
  enabled: boolean;
  status: HostedStatus;
  host: string | null;
  port: number | null;
  name: string | null;
  error: string | null;
};

export function emptyHostedPayload(slug: string): PartyHostedPayload {
  return {
    enabled: isHostableGame(slug),
    status: "none",
    host: null,
    port: null,
    name: null,
    error: null,
  };
}
