import { permanentRedirect } from "next/navigation";

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/games/${slug}`);
}
