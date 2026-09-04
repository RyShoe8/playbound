import { getGame } from "@/lib/catalog";
import { pageMetadata, privateMetadata, gameTitle } from "@/lib/seo";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { CONTROL_SCHEME_LABELS, documentedSchemes } from "@/lib/controls/types";
import { GamePageFrame } from "../page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerCanSeeTesting();
  const game = await getGame(slug, { includeTesting });
  if (!game) return privateMetadata("Controls Not Found");
  if (game.status === "testing") return privateMetadata(gameTitle(game));
  const schemes = documentedSchemes(game.controls).filter((scheme) => scheme.bindings.length > 0).map((scheme) => CONTROL_SCHEME_LABELS[scheme.scheme].toLowerCase());
  const list = schemes.length > 1 ? `${schemes.slice(0, -1).join(", ")} and ${schemes.at(-1)}` : schemes[0] || "keyboard";
  return pageMetadata({
    title: `${game.title} Controls & Keybinds`,
    description: `Default ${list} controls for ${game.title} — every key, button and binding.`,
    path: `/games/${game.slug}/controls`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

export default function GameControlsPage({ params }: { params: Promise<{ slug: string }> }) {
  return <GamePageFrame params={params} searchParams={Promise.resolve({})} forcedTab="controls" />;
}
