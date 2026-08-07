/**
 * PlayBound Weekly — helpers + static seed for empty-DB fallback.
 * Live issues live in Mongo (see lib/weekly.ts). Admin only sets date + game.
 */

export interface WeeklyIssueSeed {
  year: number;
  week: number;
  gameSlug: string;
  /** ISO date (YYYY-MM-DD), typically Wednesday. */
  publishedAt: string;
  published?: boolean;
  /** Optional newsletter builder draft (Mongo / admin only). */
  emailDraft?: unknown;
}

/** Canonical URL slug for an issue. Stable forever. */
export function issueSlug(issue: Pick<WeeklyIssueSeed, "year" | "week" | "gameSlug">): string {
  return `${issue.year}-w${String(issue.week).padStart(2, "0")}-${issue.gameSlug}`;
}

export const weeklyIssuesSeed: WeeklyIssueSeed[] = [
  {
    year: 2026,
    week: 31,
    gameSlug: "openra",
    publishedAt: "2026-07-29",
    published: true,
  },
];

/** ISO week number for a date — used when creating new issues. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** @deprecated Prefer lib/weekly — kept for gradual import migration. */
export const weeklyIssues = weeklyIssuesSeed;
export const issuesBySlug = new Map(weeklyIssuesSeed.map((i) => [issueSlug(i), i]));
export function issuesNewestFirst(): WeeklyIssueSeed[] {
  return [...weeklyIssuesSeed].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
export function issueForGame(gameSlug: string): WeeklyIssueSeed | undefined {
  return issuesNewestFirst().find((i) => i.gameSlug === gameSlug);
}
