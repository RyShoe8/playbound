import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import EditionModel from "@/lib/models/Edition";
import EditorialReviewSource from "@/lib/models/EditorialReviewSource";
import type { SyncTarget } from "@/lib/editorialReviews/sync";

/**
 * Every target the sync covers: each game (published or in testing, so a
 * game arrives with its rating) and each stored, visible edition. The
 * synthesized base-game edition is the game itself and is not listed twice.
 */
export async function allSyncTargets({ gameSlug }: { gameSlug?: string } = {}): Promise<SyncTarget[]> {
  await dbConnect();
  const gameFilter = gameSlug ? { slug: gameSlug } : { $or: [{ published: true }, { status: { $in: ["published", "testing", "ready"] } }] };
  const games = await CatalogGame.find(gameFilter).select("slug title releaseYear").lean<{ slug: string; title: string; releaseYear?: number }[]>();
  const slugs = games.map((g) => g.slug);
  const editions = await EditionModel.find({ gameSlug: { $in: slugs }, visibility: { $ne: "hidden" }, slug: { $ne: "official" } })
    .select("gameSlug slug name releaseYear")
    .lean<{ gameSlug: string; slug: string; name: string; releaseYear?: number | null }[]>();
  return [
    ...games.map((g) => ({ gameSlug: g.slug, editionSlug: null, title: g.title, releaseYear: g.releaseYear ?? null })),
    ...editions.map((e) => ({ gameSlug: e.gameSlug, editionSlug: e.slug, title: e.name, releaseYear: e.releaseYear ?? null })),
  ];
}

/** The targets synced longest ago (never-synced first), up to `limit`. */
export async function staleSyncTargets(limit: number): Promise<SyncTarget[]> {
  const targets = await allSyncTargets();
  const sources = await EditorialReviewSource.find()
    .select("gameSlug editionSlug lastSyncAt disabled")
    .lean<{ gameSlug: string; editionSlug: string | null; lastSyncAt?: Date | null; disabled?: boolean }[]>();
  const state = new Map(sources.map((s) => [`${s.gameSlug}/${s.editionSlug ?? ""}`, s]));
  return targets
    .filter((t) => !state.get(`${t.gameSlug}/${t.editionSlug ?? ""}`)?.disabled)
    .map((t) => ({ t, at: state.get(`${t.gameSlug}/${t.editionSlug ?? ""}`)?.lastSyncAt?.getTime() ?? 0 }))
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((x) => x.t);
}
