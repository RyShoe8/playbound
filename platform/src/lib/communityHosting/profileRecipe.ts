import { getPartyHostableGame } from "@/lib/gameHost/catalog";

/** Edition-specific server recipes take precedence over old stored profile slugs. */
export function profileRecipeSlug(profile: {
  gameSlug: string;
  editionSlug?: string | null;
  recipeSlug?: string | null;
}): string {
  return getPartyHostableGame(profile.gameSlug, profile.editionSlug)?.slug
    || profile.recipeSlug
    || profile.gameSlug;
}
