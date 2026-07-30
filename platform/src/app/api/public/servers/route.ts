import { listGames } from "@/lib/catalog";
import { listServersForGame } from "@/lib/servers/registry";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

type GameServerSummary = {
  slug: string;
  title: string;
  supported: boolean;
  serverCount: number;
  playerCount: number;
  license: string;
  url: string;
};

/**
 * Public, documented snapshot of live multiplayer activity across the catalog.
 *
 * Genuinely unique data — nobody else publishes normalised player counts for
 * free open-source games in one place. Being the only source of a verifiable,
 * dated dataset is one of the strongest routes to citation and inbound links,
 * so this is deliberately open and CORS-enabled.
 */
export async function GET() {
  const games = await listGames();
  const multiplayer = games.filter((g) => g.launchMethods.includes("server"));

  const settled = await Promise.allSettled(
    multiplayer.map(async (game): Promise<GameServerSummary> => {
      const result = await listServersForGame(game.slug);
      const servers = result.servers ?? [];
      return {
        slug: game.slug,
        title: game.title,
        supported: Boolean(result.supported),
        serverCount: servers.length,
        playerCount: servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0),
        license: game.license,
        url: `${SITE_URL}/games/${game.slug}/servers`,
      };
    })
  );

  const rows: GameServerSummary[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") rows.push(result.value);
  }
  rows.sort((a, b) => b.playerCount - a.playerCount);

  return Response.json(
    {
      source: `PlayBound (${SITE_URL})`,
      documentation: `${SITE_URL}/llms.txt`,
      license: "CC BY 4.0 — attribution to PlayBound required",
      fetchedAt: new Date().toISOString(),
      totals: {
        games: rows.length,
        servers: rows.reduce((sum, g) => sum + g.serverCount, 0),
        players: rows.reduce((sum, g) => sum + g.playerCount, 0),
      },
      games: rows,
    },
    {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
        "access-control-allow-origin": "*",
      },
    }
  );
}
