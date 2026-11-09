import { getGame } from "@/lib/catalog";
import { getEditionBySlug } from "@/lib/editions";

/**
 * A review of a base game whose edition is the synthesized base game is the
 * same target as the game itself, so it is stored with editionSlug null.
 */
export async function resolveEditorialTarget(
  gameSlug: string,
  editionSlug: string | null,
  { admin = false, includeTesting = false }: { admin?: boolean; includeTesting?: boolean } = {}
) {
  // Admins rate games still in Testing so they arrive with their rating.
  const game = await getGame(gameSlug, admin ? { includeUnpublished: true, includeTesting: true } : { includeTesting });
  if (!game) return { error: "Unknown game" as const };
  if (!editionSlug) return { editionSlug: null, edition: null };
  const edition = await getEditionBySlug(game, editionSlug, admin ? { includeHidden: true } : {});
  if (!edition) return { error: "Unknown edition" as const };
  return { editionSlug: edition.virtual ? null : edition.slug, edition };
}

