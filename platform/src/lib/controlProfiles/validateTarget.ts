import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";

/** Reject misspelled targets before a profile can be verified or shown publicly. */
export async function validateProfileTarget(gameSlug: string, editionSlug: string | null) {
  if (!(await CatalogGame.exists({ slug: gameSlug }))) return "Game slug does not exist";
  if (editionSlug && !(await Edition.exists({ gameSlug, slug: editionSlug }))) {
    return "Edition slug does not exist for this game";
  }
  return null;
}
