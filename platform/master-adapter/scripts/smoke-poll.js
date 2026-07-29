import { pollGame, GAMES } from "../src/poll.js";

const slugs = process.argv.slice(2);
const games = slugs.length
  ? GAMES.filter((g) => slugs.includes(g.slug))
  : GAMES;

for (const game of games) {
  const t0 = Date.now();
  try {
    const servers = await pollGame(game);
    console.log(
      JSON.stringify({
        slug: game.slug,
        ok: true,
        count: servers.length,
        ms: Date.now() - t0,
        sample: servers.slice(0, 2).map((s) => ({ name: s.name, players: s.players, host: s.host })),
      })
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        slug: game.slug,
        ok: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
