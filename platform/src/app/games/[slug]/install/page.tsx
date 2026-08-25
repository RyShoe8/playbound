import { permanentRedirect } from "next/navigation";

/** Legacy SEO URL — install lives on the game hub as ?tab=install. */
export default async function InstallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/games/${slug}?tab=install`);
}
