/**
 * Editorial Rating and Community Rating maths, kept free of the database so
 * the pages, the API and the tests all agree on one definition.
 *
 * Editorial Rating: outlet scores normalised to 0–100 and averaged, shown
 * only once enough scored reviews exist that one outlier cannot carry it.
 * Community Rating: player star ratings (1–5) shown out of 10, the same scale
 * a reader expects from a user score.
 */

/** Scored reviews needed before an aggregate is shown rather than "not enough reviews". */
export const MIN_EDITORIAL_REVIEWS = 3;
export const MIN_COMMUNITY_RATINGS = 3;

export interface ScoredLike {
  score?: number | null;
  scoreMax?: number | null;
  /** Printed form when the outlet did not use a number (a letter grade). */
  scoreText?: string | null;
}

/** An outlet score on a 0–100 scale, or null when the review is unscored or malformed. */
export function normalizedScore(r: ScoredLike): number | null {
  const { score, scoreMax } = r;
  if (typeof score !== "number" || typeof scoreMax !== "number") return null;
  if (!Number.isFinite(score) || !Number.isFinite(scoreMax) || scoreMax <= 0 || score < 0 || score > scoreMax) {
    return null;
  }
  return Math.round((score / scoreMax) * 100);
}

/** "8/10", "4.5/5", "87/100" — the score as the outlet published it. */
export function formatOutletScore(r: ScoredLike): string | null {
  if (normalizedScore(r) == null) return null;
  if (r.scoreText) return r.scoreText;
  const n = Number.isInteger(r.score) ? String(r.score) : String(Number(r.score!.toFixed(1)));
  return `${n}/${r.scoreMax}`;
}

export type RatingTone = "positive" | "mixed" | "negative";

/** Metacritic's bands, so the words mean what readers already expect. */
export function editorialVerdict(score: number): { label: string; tone: RatingTone } {
  if (score >= 90) return { label: "Universal acclaim", tone: "positive" };
  if (score >= 75) return { label: "Generally favorable", tone: "positive" };
  if (score >= 50) return { label: "Mixed or average", tone: "mixed" };
  if (score >= 20) return { label: "Generally unfavorable", tone: "negative" };
  return { label: "Overwhelming dislike", tone: "negative" };
}

/** Same bands on the 0–10 community scale. */
export function communityVerdict(score10: number): { label: string; tone: RatingTone } {
  return editorialVerdict(Math.round(score10 * 10));
}

export function toneForScore(score100: number): RatingTone {
  return editorialVerdict(score100).tone;
}

export interface EditorialAggregate {
  /** 0–100, or null below the minimum. */
  score: number | null;
  scoredCount: number;
  totalCount: number;
  verdict: { label: string; tone: RatingTone } | null;
}

export function aggregateEditorial(reviews: ScoredLike[]): EditorialAggregate {
  const scores = reviews.map(normalizedScore).filter((s): s is number => s != null);
  const enough = scores.length >= MIN_EDITORIAL_REVIEWS;
  const score = enough ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return {
    score,
    scoredCount: scores.length,
    totalCount: reviews.length,
    verdict: score == null ? null : editorialVerdict(score),
  };
}

export interface CommunityAggregate {
  /** 0–10 with one decimal, or null below the minimum. */
  score: number | null;
  count: number;
  verdict: { label: string; tone: RatingTone } | null;
}

/**
 * From a sum and count of 1–5 star ratings (what a Mongo $group returns).
 * 5 stars is 10, 1 star is 2 — a straight doubling, so the number a player
 * sees matches the stars they gave.
 */
export function aggregateCommunity(sum: number, count: number): CommunityAggregate {
  if (!Number.isFinite(sum) || !Number.isFinite(count) || count < MIN_COMMUNITY_RATINGS) {
    return { score: null, count: Math.max(0, count || 0), verdict: null };
  }
  const score = Math.round((sum / count) * 2 * 10) / 10;
  return { score, count, verdict: communityVerdict(score) };
}

/** Highest first, unscored last, then newest — how the snippets are listed. */
export function sortEditorialReviews<T extends ScoredLike & { publishedAt?: Date | string | null }>(items: T[]): T[] {
  const time = (d: T["publishedAt"]) => (d ? new Date(d).getTime() || 0 : 0);
  return [...items].sort((a, b) => {
    const sa = normalizedScore(a);
    const sb = normalizedScore(b);
    if (sa == null && sb != null) return 1;
    if (sb == null && sa != null) return -1;
    if (sa != null && sb != null && sa !== sb) return sb - sa;
    return time(b.publishedAt) - time(a.publishedAt);
  });
}
