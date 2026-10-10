import { notFound, permanentRedirect } from "next/navigation";
import { canonicalSlugFor, getGame } from "@/lib/catalog";
import { privateMetadata } from "@/lib/seo";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";

/**
 * Controls are a section of the game page (#controls), not a page of their own.
 * Kept as a permanent redirect so every indexed or shared /controls URL lands on
 * the game page and passes its ranking signals there.
 */
export async function generateMetadata() {
  return privateMetadata("Controls");
}

export default async function GameControlsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug, { includeTesting: await viewerCanSeeTesting() });
  if (game) permanentRedirect(`/games/${game.slug}#controls`);
  const canonical = await canonicalSlugFor(slug);
  if (canonical) permanentRedirect(`/games/${canonical}#controls`);
  notFound();
}
