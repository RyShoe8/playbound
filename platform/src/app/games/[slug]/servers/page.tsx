import { permanentRedirect } from "next/navigation";

/**
 * Legacy per-game servers URL — send users to the global browser with the game
 * pre-selected so formatting stays consistent.
 */
export default async function GameServersRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/servers?game=${encodeURIComponent(slug)}`);
}
