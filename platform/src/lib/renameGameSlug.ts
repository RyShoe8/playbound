import dbConnect from "@/lib/db";
import CatalogCollection from "@/lib/models/CatalogCollection";
import CatalogMod from "@/lib/models/CatalogMod";
import DiscussionPost from "@/lib/models/DiscussionPost";
import DiscussionReply from "@/lib/models/DiscussionReply";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import Edition from "@/lib/models/Edition";
import GuidePost from "@/lib/models/GuidePost";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import PlatformEvent from "@/lib/models/PlatformEvent";
import Review from "@/lib/models/Review";
import WeeklyIssue from "@/lib/models/WeeklyIssue";

/**
 * Every collection that stores a game slug as a foreign key.
 *
 * A game slug is referenced by value, not by ObjectId, so renaming the catalog
 * document alone would silently detach all of this: users' installed games,
 * their reviews, the game's entire discussion forum, and any mods pinned to it
 * as a base game. Kept as one list so a new collection that references a game
 * has a single obvious place to be registered.
 */
const REFERENCES: { label: string; model: { updateMany: (f: object, u: object) => unknown }; field: string }[] = [
  { label: "mods", model: CatalogMod, field: "baseGameSlug" },
  { label: "discussionPosts", model: DiscussionPost, field: "gameSlug" },
  { label: "discussionReplies", model: DiscussionReply, field: "gameSlug" },
  { label: "discussionTopics", model: DiscussionTopic, field: "gameSlug" },
  // Editions denormalize gameSlug alongside gameId. Without this a rename
  // would orphan every edition: the game page would fall back to its virtual
  // Official edition and the real ones would be unreachable.
  { label: "editions", model: Edition, field: "gameSlug" },
  { label: "guides", model: GuidePost, field: "gameSlug" },
  { label: "libraryEntries", model: LibraryEntry, field: "gameSlug" },
  { label: "libraryModEntries", model: LibraryModEntry, field: "baseGameSlug" },
  { label: "events", model: PlatformEvent, field: "gameSlug" },
  { label: "reviews", model: Review, field: "gameSlug" },
  { label: "weeklyIssues", model: WeeklyIssue, field: "gameSlug" },
];

export type SlugRenameReport = Record<string, number>;

/**
 * Repoint every reference from `oldSlug` to `newSlug`.
 *
 * Call this *after* the catalog document itself has been renamed. Returns a
 * per-collection count of updated documents so the admin can see what moved.
 */
export async function cascadeGameSlugRename(
  oldSlug: string,
  newSlug: string
): Promise<SlugRenameReport> {
  if (oldSlug === newSlug) return {};
  await dbConnect();

  const report: SlugRenameReport = {};

  /**
   * Collections store an ordered array of slugs, so the positional $ operator
   * is used to swap the matching element in place and preserve the ranking.
   * Repeated until no document matches, since $ only updates the first hit and
   * a slug could (wrongly, but harmlessly) appear more than once.
   */
  let collectionsTouched = 0;
  for (;;) {
    const res = await CatalogCollection.updateMany(
      { gameSlugs: oldSlug },
      { $set: { "gameSlugs.$": newSlug } }
    );
    const n = res?.modifiedCount ?? 0;
    collectionsTouched += n;
    if (n === 0) break;
  }
  if (collectionsTouched > 0) report.collections = collectionsTouched;

  for (const ref of REFERENCES) {
    const res = (await ref.model.updateMany(
      { [ref.field]: oldSlug },
      { $set: { [ref.field]: newSlug } }
    )) as { modifiedCount?: number };
    const n = res?.modifiedCount ?? 0;
    if (n > 0) report[ref.label] = n;
  }
  return report;
}

/**
 * Static data in src/lib/data/*.ts references slugs in source, which a database
 * write cannot reach. Surfaced to the admin so the rename does not quietly
 * empty a collection page or a comparison.
 */
export function staticReferenceWarning(oldSlug: string): string {
  return `Collections were updated automatically. If "${oldSlug}" also appears in src/lib/data/comparisons.ts or alternatives.ts, update those by hand — they still live in code.`;
}
