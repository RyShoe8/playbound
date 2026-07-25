export type ServerLocation = {
  countryCode: string;
  region?: string;
};

export type GameServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  players: number;
  maxPlayers: number | null;
  map: string | null;
  gameType: string | null;
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
