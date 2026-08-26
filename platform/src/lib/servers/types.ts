export type ServerLocation = {
  countryCode: string;
  region?: string;
  /** US state / admin code from GeoIP when available (e.g. CA). */
  regionCode?: string;
  /** WGS84 degrees from GeoIP when available. */
  lat?: number;
  lon?: number;
};

export type GameServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  gameType: string | null;
  /**
   * Raw client-join key for the provider's mod/variant, when the provider
   * distinguishes one — e.g. OpenRA's "ra"/"cnc"/"d2k". Distinct from
   * `gameType`, which is a display label. Null when the provider has only
   * one variant or doesn't expose this.
   */
  mod?: string | null;
  location: ServerLocation | null;
  protected: boolean;
};

export type ServerListResult = {
  supported: boolean;
  servers: GameServer[];
  updatedAt: string;
  error?: string;
};

export interface ServerProvider {
  slug: string;
  fetchServers: () => Promise<GameServer[]>;
}

export const MAX_SERVERS = 100;
