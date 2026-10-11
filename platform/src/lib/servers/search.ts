export function matchesServerSearch(server: {
  name: string;
  gameTitle?: string;
  gameSlug?: string;
  map?: string | null;
  gameType?: string | null;
  players?: number | null;
  maxPlayers?: number | null;
}, query: string, editionLabel = ""): boolean {
  return [server.name, server.gameTitle, server.gameSlug, server.map, server.gameType, editionLabel,
    `${server.players}/${server.maxPlayers}`].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase());
}
