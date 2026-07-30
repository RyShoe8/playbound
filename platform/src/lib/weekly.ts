import dbConnect from "@/lib/db";
import WeeklyIssueModel from "@/lib/models/WeeklyIssue";
import {
  issueSlug,
  isoWeek,
  weeklyIssuesSeed,
  type WeeklyIssueSeed,
} from "@/lib/data/weekly";

export type WeeklyIssue = WeeklyIssueSeed & {
  slug: string;
  published: boolean;
};

export { issueSlug, isoWeek };

function toIssue(doc: Record<string, unknown>): WeeklyIssue {
  const year = Number(doc.year);
  const week = Number(doc.week);
  const gameSlug = String(doc.gameSlug);
  return {
    slug: String(doc.slug || issueSlug({ year, week, gameSlug })),
    year,
    week,
    gameSlug,
    publishedAt: String(doc.publishedAt).slice(0, 10),
    published: doc.published !== false,
  };
}

function seedAsIssues(includeUnpublished: boolean): WeeklyIssue[] {
  return weeklyIssuesSeed
    .filter((i) => includeUnpublished || i.published !== false)
    .map((i) => ({
      ...i,
      slug: issueSlug(i),
      published: i.published !== false,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

async function mongoHasIssues(): Promise<boolean> {
  try {
    await dbConnect();
    return (await WeeklyIssueModel.countDocuments()) > 0;
  } catch {
    return false;
  }
}

/** Published issues, newest first. */
export async function listWeeklyIssues(opts?: {
  includeUnpublished?: boolean;
}): Promise<WeeklyIssue[]> {
  const includeUnpublished = Boolean(opts?.includeUnpublished);
  try {
    if (await mongoHasIssues()) {
      const filter: Record<string, unknown> = {};
      if (!includeUnpublished) filter.published = true;
      const docs = await WeeklyIssueModel.find(filter).sort({ publishedAt: -1 }).lean();
      return docs.map((d) => toIssue(d as Record<string, unknown>));
    }
  } catch (err) {
    console.error("[weekly] listWeeklyIssues failed:", err);
  }
  return seedAsIssues(includeUnpublished);
}

export async function getWeeklyIssue(
  slug: string,
  opts?: { includeUnpublished?: boolean }
): Promise<WeeklyIssue | undefined> {
  try {
    if (await mongoHasIssues()) {
      const filter: Record<string, unknown> = { slug };
      if (!opts?.includeUnpublished) filter.published = true;
      const doc = await WeeklyIssueModel.findOne(filter).lean();
      return doc ? toIssue(doc as Record<string, unknown>) : undefined;
    }
  } catch (err) {
    console.error("[weekly] getWeeklyIssue failed:", err);
  }
  return seedAsIssues(Boolean(opts?.includeUnpublished)).find((i) => i.slug === slug);
}

export async function issueForGame(gameSlug: string): Promise<WeeklyIssue | undefined> {
  const all = await listWeeklyIssues();
  return all.find((i) => i.gameSlug === gameSlug);
}

export function buildIssueFromDate(publishedAt: string, gameSlug: string): Omit<WeeklyIssue, "published"> & {
  published?: boolean;
} {
  const date = new Date(`${publishedAt}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid publishedAt date");
  }
  const { year, week } = isoWeek(date);
  const base = { year, week, gameSlug, publishedAt: publishedAt.slice(0, 10) };
  return { ...base, slug: issueSlug(base) };
}
