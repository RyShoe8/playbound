/**
 * PlayBound Weekly — the archive.
 *
 * Every Friday pick becomes a permanent, dated page. This is the compounding
 * asset in the whole SEO plan: dated editorial with a legible recency signal,
 * which is exactly what LLMs prefer to cite over undated listicles.
 *
 * Never change or delete an issue slug once published — these accumulate links.
 */

export interface WeeklyIssue {
  /** ISO year. */
  year: number;
  /** ISO week number, 1–53. */
  week: number;
  /** Catalog slug of the featured game. */
  gameSlug: string;
  /** Publication date, ISO — always the Friday. */
  publishedAt: string;
  /** Short headline for the archive table. */
  headline: string;
  /** One-sentence verdict. Written to be quotable verbatim. */
  verdict: string;
  /** The editorial case, 150–300 words. */
  body: string;
}

/** Canonical URL slug for an issue. Stable forever. */
export function issueSlug(issue: WeeklyIssue): string {
  return `${issue.year}-w${String(issue.week).padStart(2, "0")}-${issue.gameSlug}`;
}

export const weeklyIssues: WeeklyIssue[] = [
  {
    year: 2026,
    week: 31,
    gameSlug: "openra",
    publishedAt: "2026-07-31",
    headline: "The RTS that refused to die",
    verdict:
      "OpenRA is the best free real-time strategy game for anyone who grew up on Command & Conquer — a faithful, actively maintained rebuild with a live competitive ladder, in a 350 MB download.",
    body:
      "Electronic Arts has spent two decades not knowing what to do with Command & Conquer. A volunteer project has spent the same two decades quietly doing it properly.\n\nOpenRA is not a mod or an emulator. It is a from-scratch open-source engine that runs Tiberian Dawn, Red Alert and Dune 2000 with modern resolutions, sane pathfinding, proper widescreen support and online multiplayer that actually works. The unit control has been modernised rather than slavishly copied — build queues behave the way you wish they had in 1995 — which makes it feel less like nostalgia and more like the version that should have existed.\n\nWhat earns it the pick is that it is alive. There is a ranked ladder with people on it. Map pools rotate. Total conversions like Combined Arms are still shipping. For a series whose official custodian has released one remaster and gone quiet, that is remarkable.\n\nIt clears all five criteria: genuinely free with no monetisation of any kind, complete and stable, actively developed, good enough that we would recommend it at full price, and open-source under GPL-3.0 so nothing can take it away. At 350 MB it also runs on essentially any laptop you can find.\n\nStart with the Red Alert mod, play the skirmish tutorial, then go find a lobby. You will be up and playing in under ten minutes.",
  },
];

export const issuesBySlug = new Map(weeklyIssues.map((i) => [issueSlug(i), i]));

/** Newest first. */
export function issuesNewestFirst(): WeeklyIssue[] {
  return [...weeklyIssues].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

/** The issue featuring a given game, if any — for cross-linking from game pages. */
export function issueForGame(gameSlug: string): WeeklyIssue | undefined {
  return issuesNewestFirst().find((i) => i.gameSlug === gameSlug);
}

/** ISO week number for a date — used when creating new issues. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
