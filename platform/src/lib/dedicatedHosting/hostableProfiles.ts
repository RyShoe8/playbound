/**
 * Profiles the admin can offer on a tier: every stored profile, plus a
 * read-only stub for each hostable game (and edition) that has no stored row
 * yet. Without the stubs, a game the agent can host never appears in the
 * "Add a server profile" list until something has already written its row.
 *
 * Mirrors how the community-hosting screen lists hostable games. Nothing here
 * writes: the stored row is still created the first time admin saves it.
 */
import dbConnect from "@/lib/db";
import Edition from "@/lib/models/Edition";
import { editions as seedEditions } from "@/lib/data/editions";
import { HOSTABLE_SLUGS, HOSTABLE_SLUG_ALIASES } from "@/lib/gameHost/catalog";

export type EditionRef = { gameSlug: string; slug: string };
export type StoredProfileRef = { key: string; gameSlug: string; editionSlug?: string | null };
export type ProfileStub = {
  key: string;
  gameSlug: string;
  editionSlug: string | null;
  recipeSlug: string;
};

export function hostableProfileStubs(stored: StoredProfileRef[], editions: EditionRef[]): ProfileStub[] {
  const storedKeys = new Set(stored.map((p) => p.key));
  const storedPairs = new Set(stored.map((p) => `${p.gameSlug}:${p.editionSlug || ""}`));
  const slugs = HOSTABLE_SLUGS.filter((slug) => !HOSTABLE_SLUG_ALIASES[slug]);
  const stubs: ProfileStub[] = [];
  const add = (gameSlug: string, editionSlug: string | null) => {
    const key = `${gameSlug}:${editionSlug || "base"}`;
    if (storedKeys.has(key) || storedPairs.has(`${gameSlug}:${editionSlug || ""}`)) return;
    storedKeys.add(key);
    stubs.push({ key, gameSlug, editionSlug, recipeSlug: gameSlug });
  };
  for (const slug of slugs) {
    add(slug, null);
    for (const edition of editions) if (edition.gameSlug === slug) add(slug, edition.slug);
  }
  return stubs;
}

/** Non-archived, non-hidden editions of hostable games, from the database and the seed file. */
export async function loadHostableEditionRefs(): Promise<EditionRef[]> {
  const slugs = HOSTABLE_SLUGS.filter((slug) => !HOSTABLE_SLUG_ALIASES[slug]);
  await dbConnect();
  const rows = await Edition.find({
    gameSlug: { $in: slugs },
    status: { $ne: "archived" },
    visibility: { $ne: "hidden" },
  }).select({ gameSlug: 1, slug: 1, suppressesSeed: 1 }).lean();
  const suppressed = new Set(rows.filter((e) => (e as { suppressesSeed?: boolean }).suppressesSeed).map((e) => `${e.gameSlug}:${e.slug}`));
  const refs = new Map<string, EditionRef>();
  for (const e of rows) {
    if (!(e as { suppressesSeed?: boolean }).suppressesSeed) refs.set(`${e.gameSlug}:${e.slug}`, { gameSlug: e.gameSlug, slug: e.slug });
  }
  for (const s of seedEditions) {
    const key = `${s.gameSlug}:${s.slug}`;
    if (slugs.includes(s.gameSlug) && s.status !== "archived" && s.visibility !== "hidden" && !refs.has(key) && !suppressed.has(key)) {
      refs.set(key, { gameSlug: s.gameSlug, slug: s.slug });
    }
  }
  return [...refs.values()];
}
