import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import { listGames } from "@/lib/catalog";
import { listEditionsForGames } from "@/lib/editions";

/** Keep legacy sessions without an edition at game level; never credit a guessed edition. */
export const weeklyPopular = unstable_cache(async () => {
  const games = await listGames();
  const bySlug = new Map(games.map(game => [game.slug, game]));
  const editions = await listEditionsForGames(games);
  try {
    await dbConnect();
    const rows = await TelemetryEvent.aggregate<{
      _id: { gameSlug: string; editionSlug: string | null }; totalMs: number;
    }>([
      { $match: { event: "game_finished", isBot: { $ne: true },
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
        "properties.durationMs": { $type: "number", $gt: 0 },
        "properties.gameSlug": { $type: "string", $ne: "" } } },
      { $group: { _id: { gameSlug: "$properties.gameSlug", editionSlug: { $ifNull: ["$properties.editionSlug", null] } }, totalMs: { $sum: "$properties.durationMs" } } },
      { $sort: { totalMs: -1, "_id.gameSlug": 1, "_id.editionSlug": 1 } },
    ]);
    return rows.flatMap(row => {
      const game = bySlug.get(row._id.gameSlug);
      if (!game) return [];
      const edition = row._id.editionSlug
        ? editions.get(game.slug)?.find(item => item.slug === row._id.editionSlug) : undefined;
      // Retired/unpublished editions must not become broken homepage links.
      if (row._id.editionSlug && !edition) return [];
      return [{ game, edition: edition || null }];
    }).slice(0, 12);
  } catch (error) {
    console.error("[weekly-popular] telemetry unavailable", error);
    return [];
  }
}, ["weekly-popular-editions-v1"], { revalidate: 900, tags: ["catalog", "live-activity"] });
