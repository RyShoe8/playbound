import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import EditorialReview from "@/lib/models/EditorialReview";
import EditorialReviewSource from "@/lib/models/EditorialReviewSource";
import { getGame } from "@/lib/catalog";
import { listEditionsForGame } from "@/lib/editions";
import {
  EditorialReviewsAdmin,
  type AdminReviewItem,
  type AdminSyncSource,
} from "@/components/admin/EditorialReviewsAdmin";
import { MIN_EDITORIAL_REVIEWS } from "@/lib/ratings";

export const metadata: Metadata = { title: "Editorial Reviews | Admin" };

const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null);

export default async function AdminEditorialReviewsPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  // Never prerendered — see the layout.
  await connection();
  await dbConnect();
  const [{ game: slug = "" }, games] = await Promise.all([
    searchParams,
    CatalogGame.find().select("slug title").sort({ title: 1 }).lean(),
  ]);

  let items: AdminReviewItem[] = [];
  let editions: { slug: string; name: string }[] = [];
  let sources: AdminSyncSource[] = [];
  const game = slug ? await getGame(slug, { includeUnpublished: true, includeTesting: true }) : undefined;
  if (game) {
    const [docs, eds, srcs] = await Promise.all([
      EditorialReview.find({ gameSlug: game.slug }).sort({ createdAt: -1 }).lean<Record<string, unknown>[]>(),
      listEditionsForGame(game, { includeHidden: true }),
      EditorialReviewSource.find({ gameSlug: game.slug }).lean<Record<string, unknown>[]>(),
    ]);
    items = docs.map((d) => ({
      _id: String(d._id),
      gameSlug: String(d.gameSlug),
      editionSlug: (d.editionSlug as string | null) ?? null,
      outlet: String(d.outlet),
      author: (d.author as string | null) ?? null,
      url: String(d.url),
      snippet: (d.snippet as string | null) ?? null,
      score: typeof d.score === "number" ? d.score : null,
      scoreMax: typeof d.scoreMax === "number" ? d.scoreMax : null,
      scoreText: (d.scoreText as string | null) ?? null,
      publishedAt: iso(d.publishedAt),
      status: d.status === "hidden" ? "hidden" : "published",
      source: d.source === "wikipedia" || d.source === "outlet" ? d.source : "manual",
    }));
    editions = eds.filter((e) => !e.virtual).map((e) => ({ slug: e.slug, name: e.name }));
    sources = srcs.map((s) => ({
      editionSlug: (s.editionSlug as string | null) ?? null,
      wikipediaTitle: (s.wikipediaTitle as string | null) ?? null,
      disabled: Boolean(s.disabled),
      lastSyncAt: iso(s.lastSyncAt),
      lastStatus: (s.lastStatus as string | null) ?? null,
      matchedTitle: (s.matchedTitle as string | null) ?? null,
      foundCount: Number(s.foundCount ?? 0),
      outletCount: Number(s.outletCount ?? 0),
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Editorial reviews</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Published reviews from outside outlets, aggregated into each game&apos;s Editorial Rating. Scores are kept as the
          outlet published them and normalised to 100; the rating appears once a game or edition has {MIN_EDITORIAL_REVIEWS}{" "}
          scored reviews. Every entry links to the full piece.
        </p>
      </div>
      <EditorialReviewsAdmin
        key={game?.slug ?? "none"}
        games={games.map((g) => ({ slug: String(g.slug), title: String(g.title) }))}
        game={game?.slug ?? ""}
        items={items}
        editions={editions}
        sources={sources}
      />
    </div>
  );
}
