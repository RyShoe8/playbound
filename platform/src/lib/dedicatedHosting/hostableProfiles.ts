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
import CatalogGame from "@/lib/models/CatalogGame";
import { DEDICATED_ONLY_GAMES, HOSTABLE_SLUGS, HOSTABLE_SLUG_ALIASES } from "@/lib/gameHost/catalog";

/** Every game the admin can put on a tier: hostable everywhere, plus the paid-plan-only games. */
function tierSlugs(): string[] {
  return [...HOSTABLE_SLUGS.filter((slug) => !HOSTABLE_SLUG_ALIASES[slug]), ...Object.keys(DEDICATED_ONLY_GAMES)];
}

export type EditionRef = { gameSlug: string; slug: string; name?: string; features?: string[]; isDefault?: boolean };
export type StoredProfileRef = { key: string; gameSlug: string; editionSlug?: string | null };
export type CatalogGameRef = { slug: string; title: string; status: string; published: boolean };

/** The shared admin enrollment gate. Files, publication and edition support
 * are independent: a game can be visible in VPS testing long before it appears
 * in Community Hosting or a paid subscription's available-game picker. */
export function readyPublishedHostableCatalog(
  games: CatalogGameRef[], editions: EditionRef[], stored: StoredProfileRef[], readySlugs: ReadonlySet<string>
): { games: CatalogGameRef[]; editions: EditionRef[] } {
  const eligibleGames = games.filter((game) => game.status === "published" && game.published && readySlugs.has(game.slug));
  const allowed = new Set(eligibleGames.map((game) => game.slug));
  const storedKeys = new Set(stored.map((profile) => profile.key));
  const eligibleEditions = editions.filter((edition) => allowed.has(edition.gameSlug) &&
    !edition.isDefault && edition.slug !== "official" && edition.slug !== "base" &&
    (edition.features?.includes("Dedicated Servers") || storedKeys.has(`${edition.gameSlug}:${edition.slug}`)));
  return { games: eligibleGames, editions: eligibleEditions };
}
export type ProfileStub = {
  key: string;
  gameSlug: string;
  editionSlug: string | null;
  recipeSlug: string;
};

export function hostableProfileStubs(stored: StoredProfileRef[], editions: EditionRef[], catalogSlugs = tierSlugs()): ProfileStub[] {
  const storedKeys = new Set(stored.map((p) => p.key));
  const storedPairs = new Set(stored.map((p) => `${p.gameSlug}:${p.editionSlug || ""}`));
  const slugs = catalogSlugs;
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

/** Non-archived, non-hidden editions of hostable games, from the database. */
export async function loadHostableEditionRefs(): Promise<EditionRef[]> {
  const slugs = (await loadHostableCatalogRefs()).map((game) => game.slug);
  await dbConnect();
  const rows = await Edition.find({
    gameSlug: { $in: slugs },
    status: { $ne: "archived" },
    visibility: { $ne: "hidden" },
  }).select({ gameSlug: 1, slug: 1, name: 1, features: 1, isDefault: 1, suppressesSeed: 1 }).lean();
  return rows.filter((e) => !(e as { suppressesSeed?: boolean }).suppressesSeed).map((e) => ({ gameSlug: e.gameSlug, slug: e.slug, name: e.name, features: e.features, isDefault: e.isDefault }));
}

export async function loadHostableCatalogRefs(): Promise<CatalogGameRef[]> {
  await dbConnect();
  return CatalogGame.find({ $or: [{ slug: { $in: tierSlugs() } }, { features: "Dedicated Servers" }] })
    .select("slug title status published").lean() as Promise<CatalogGameRef[]>;
}
