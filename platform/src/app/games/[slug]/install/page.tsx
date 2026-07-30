import { redirect } from "next/navigation";
import { getGame } from "@/lib/catalog";
import { pageMetadata, sizeLabel } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game Not Found" };

  return pageMetadata({
    title: `How to Install ${game.title} Free — ${game.platforms.join(", ")}`,
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
