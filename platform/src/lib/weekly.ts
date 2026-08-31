import dbConnect from "@/lib/db";
import { cacheLife, cacheTag } from "next/cache";
import WeeklyIssueModel from "@/lib/models/WeeklyIssue";
import NewsletterEmailTemplate from "@/lib/models/NewsletterEmailTemplate";
import type { NewsletterEmailDraft } from "@/lib/newsletterEmail";
import {
  issueSlug,
  isoWeek,
  weeklyIssuesSeed,
  type WeeklyIssueSeed,
} from "@/lib/data/weekly";

const NEWSLETTER_FOOTER_TEMPLATE_ID = "footer";

export type WeeklyIssue = WeeklyIssueSeed & {
  slug: string;
  published: boolean;
  /**
   * Stable Mongo identity. Unlike a game or collection slug, an issue's slug
   * is *derived* from its game and date and gets silently rewritten by PATCH
   * whenever either changes — editing an issue is not "renaming" it the way
   * editing a game's slug field is. A client holding an old slug (loaded
   * before an earlier edit changed it) would 404 on delete even though the
   * issue is still sitting right there in the list under its new slug. Admin
   * edit/delete actions key off this instead; empty when only the static
   * seed is available, since there is no document to act on yet.
   */
  id: string;
};

export { issueSlug, isoWeek };

function toIssue(doc: Record<string, unknown>): WeeklyIssue {
  const year = Number(doc.year);
  const week = Number(doc.week);
  const gameSlug = String(doc.gameSlug);
  return {
    id: doc._id ? String(doc._id) : "",
    slug: String(doc.slug || issueSlug({ year, week, gameSlug })),
    year,
    week,
    gameSlug,
    publishedAt: String(doc.publishedAt).slice(0, 10),
    published: doc.published !== false,
    emailDraft: doc.emailDraft ?? undefined,
  };
}

function seedAsIssues(includeUnpublished: boolean): WeeklyIssue[] {
  return weeklyIssuesSeed
    .filter((i) => includeUnpublished || i.published !== false)
    .map((i) => ({
      ...i,
      id: "",
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
  // Drafts are admin-only and must never be served from a shared cache entry,
  // the same rule listMods follows for unpublished mods.
  if (opts?.includeUnpublished) return listWeeklyIssuesUncached(true);
  return listPublishedWeeklyIssues();
}

/**
 * The public list, behind a cache boundary.
 *
 * mongoose reads the clock inside dbConnect, and Cache Components will not
 * allow that during a prerender unless the work sits behind "use cache" — so
 * without this /weekly and /weekly/[slug] cannot be built at all.
 *
 * Tagged rather than left to expire: the tag is new, because this loader was
 * previously uncached across requests and the admin routes had nothing to
 * invalidate. They drop it now, so publishing an issue still shows at once.
 */
async function listPublishedWeeklyIssues(): Promise<WeeklyIssue[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("weekly");
  return listWeeklyIssuesUncached(false);
}

async function listWeeklyIssuesUncached(includeUnpublished: boolean): Promise<WeeklyIssue[]> {
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

/**
 * Admin-only reads. These never fall back to the static seed: an admin
 * managing issues needs to see real, editable/deletable database rows, not a
 * placeholder that looks identical to one but silently reappears after
 * deletion because it was never actually stored. An empty result here means
 * "no issues saved yet," not "let me show you something anyway."
 */
export async function listWeeklyIssuesAdmin(): Promise<WeeklyIssue[]> {
  try {
    await dbConnect();
    const docs = await WeeklyIssueModel.find().sort({ publishedAt: -1 }).lean();
    return docs.map((d) => toIssue(d as Record<string, unknown>));
  } catch (err) {
    console.error("[weekly] listWeeklyIssuesAdmin failed:", err);
    return [];
  }
}

export async function getWeeklyIssueAdmin(
  by: { id: string } | { slug: string }
): Promise<WeeklyIssue | undefined> {
  try {
    await dbConnect();
    const doc =
      "id" in by ? await WeeklyIssueModel.findById(by.id).lean() : await WeeklyIssueModel.findOne({ slug: by.slug }).lean();
    return doc ? toIssue(doc as Record<string, unknown>) : undefined;
  } catch (err) {
    console.error("[weekly] getWeeklyIssueAdmin failed:", err);
    return undefined;
  }
}

export async function issueForGame(gameSlug: string): Promise<WeeklyIssue | undefined> {
  const all = await listWeeklyIssues();
  return all.find((i) => i.gameSlug === gameSlug);
}

export async function saveNewsletterFooterTemplate(
  footer: NewsletterEmailDraft["footer"]
): Promise<void> {
  await dbConnect();
  await NewsletterEmailTemplate.findOneAndUpdate(
    { _id: NEWSLETTER_FOOTER_TEMPLATE_ID },
    { $set: { footer } },
    { upsert: true }
  );
}

function footerFromUnknown(raw: unknown): NewsletterEmailDraft["footer"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const footer = (raw as { footer?: unknown }).footer;
  if (!footer || typeof footer !== "object") return undefined;
  return footer as NewsletterEmailDraft["footer"];
}

/** Latest saved newsletter footer, used as the default for new issues. */
export async function getNewsletterFooterTemplate(opts?: {
  year?: number;
}): Promise<NewsletterEmailDraft["footer"] | undefined> {
  try {
    await dbConnect();
    const doc = await NewsletterEmailTemplate.findById(NEWSLETTER_FOOTER_TEMPLATE_ID).lean();
    const stored = footerFromUnknown(doc);
    if (stored) {
      return opts?.year ? { ...stored, copyrightYear: opts.year } : stored;
    }

    const last = await WeeklyIssueModel.findOne({ "emailDraft.footer": { $exists: true } })
      .sort({ updatedAt: -1 })
      .lean();
    const fromIssue = footerFromUnknown(last?.emailDraft);
    if (!fromIssue) return undefined;
    return opts?.year ? { ...fromIssue, copyrightYear: opts.year } : fromIssue;
  } catch (err) {
    console.error("[weekly] getNewsletterFooterTemplate failed:", err);
    return undefined;
  }
}

export function buildIssueFromDate(publishedAt: string, gameSlug: string): Omit<WeeklyIssue, "published" | "id"> & {
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
