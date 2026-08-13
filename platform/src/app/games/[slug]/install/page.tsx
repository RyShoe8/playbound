import { redirect } from "next/navigation";
import { getGame } from "@/lib/catalog";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { pageMetadata, privateMetadata, sizeLabel } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const includeTesting = await viewerCanSeeTesting();
  const game = await getGame(slug, { includeTesting });
  if (!game) return { title: "Game Not Found" };
  if (game.status === "testing") return privateMetadata(`How to Install ${game.title}`);

  return pageMetadata({
    // The full platform list ran to five entries on cross-platform games
    // ("Windows, macOS, Linux, Android, iOS"), which alone outspent the
    // character budget the layout's " · PlayBound" suffix leaves. The platforms
    // are still in the description and on the page itself.
    title: `How to Install ${game.title} Free`,
    description: `Step-by-step instructions to download and install ${game.title} for free on ${game.platforms.join(", ")}. ${sizeLabel(game.sizeMB)} download, ${game.license}, no payment required.`,
    path: `/games/${game.slug}/install`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

/** Legacy SEO URL — install lives on the game hub as ?tab=install. */
export default async function InstallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/games/${slug}?tab=install`);
}
