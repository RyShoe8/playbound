import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import EditorialReview from "@/lib/models/EditorialReview";
import Review from "@/lib/models/Review";
import {
  aggregateCommunity,
  aggregateEditorial,
  sortEditorialReviews,
  type CommunityAggregate,
  type EditorialAggregate,
} from "@/lib/ratings";

export interface EditorialReviewItem {
  id: string;
  outlet: string;
  author: string | null;
  url: string;
  snippet: string | null;
  score: number | null;
  scoreMax: number | null;
  scoreText: string | null;
  publishedAt: string | null;
}

export interface Ratings {
  editorial: EditorialAggregate;
  community: CommunityAggregate;
  reviews: EditorialReviewItem[];
}

/** Cache tag for one game's ratings; every write path revalidates it. */
export function ratingsTag(gameSlug: string): string {
  return `ratings:${gameSlug}`;
}

const EMPTY: Ratings = {
  editorial: { score: null, scoredCount: 0, totalCount: 0, verdict: null },
  community: { score: null, count: 0, verdict: null },
  reviews: [],
};

async function loadRatings(gameSlug: string, editorialSlug: string | null, communitySlug: string | null): Promise<Ratings> {
  await dbConnect();
  const [docs, community] = await Promise.all([
    EditorialReview.find({ gameSlug, editionSlug: editorialSlug, status: "published" }).lean(),
    Review.aggregate<{ sum: number; count: number }>([
      { $match: { gameSlug, editionSlug: communitySlug, modSlug: null, gearSlug: null } },
      { $group: { _id: null, sum: { $sum: "$rating" }, count: { $sum: 1 } } },
    ]),
  ]);
  const reviews = sortEditorialReviews(
    (docs as Record<string, unknown>[]).map((d) => ({
      id: String(d._id),
      outlet: String(d.outlet),
      author: (d.author as string | null) ?? null,
      url: String(d.url),
      snippet: typeof d.snippet === "string" && d.snippet ? d.snippet : null,
      score: typeof d.score === "number" ? d.score : null,
      scoreMax: typeof d.scoreMax === "number" ? d.scoreMax : null,
      scoreText: typeof d.scoreText === "string" ? d.scoreText : null,
      publishedAt: d.publishedAt ? new Date(d.publishedAt as Date).toISOString() : null,
    }))
  );
  return {
    editorial: aggregateEditorial(reviews),
    community: aggregateCommunity(community[0]?.sum ?? 0, community[0]?.count ?? 0),
    reviews,
  };
}

/**
 * Editorial and Community Rating for a game (editionSlug null) or one edition.
 *
 * `baseGame` marks the synthesized base-game edition: outlet reviews of the
 * base game are stored against the game itself, while player reviews written
 * on that edition page carry its slug, as they always have.
 *
 * Cached per target and tagged per game, so the hero badge on a busy page does
 * not query Mongo on every view; admin edits and new player reviews revalidate
 * the tag. Failures degrade to "no ratings" rather than breaking the page.
 */
export async function getRatings(
  gameSlug: string,
  editionSlug: string | null = null,
  { baseGame = false }: { baseGame?: boolean } = {}
): Promise<Ratings> {
  const editorialSlug = baseGame ? null : editionSlug;
  try {
    return await unstable_cache(
      () => loadRatings(gameSlug, editorialSlug, editionSlug),
      ["ratings", gameSlug, editionSlug ?? "_game", baseGame ? "base" : "own"],
      { tags: [ratingsTag(gameSlug)], revalidate: 600 }
    )();
  } catch (err) {
    console.error("Ratings load failed:", err);
    return EMPTY;
  }
}
