import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { LaunchGatewayClient } from "@/components/launch/LaunchGatewayClient";

type Props = {
  searchParams: Promise<{
    game?: string;
    slug?: string;
    edition?: string;
    host?: string;
    port?: string;
    name?: string;
    eventId?: string;
    action?: "join" | "install" | "play";
  }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const gameSlug = sp.game || sp.slug || "game";
  const game = await getGame(gameSlug);
  const title = game?.title || gameSlug;

  return pageMetadata({
    title: `Launch ${title} — 1-Click Join`,
    description: `1-Click launch and auto-join PlayBound match server for ${title}.`,
    path: "/launch",
    noIndex: true, // Internal handoff route
  });
}

export default async function LaunchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const gameSlug = sp.game || sp.slug;
  if (!gameSlug) {
    notFound();
  }

  const game = await getGame(gameSlug);
  const gameTitle = game?.title || gameSlug;
  const coverImage = game?.coverImage || null;
  const portNum = sp.port ? parseInt(sp.port, 10) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <LaunchGatewayClient
        gameSlug={gameSlug}
        gameTitle={gameTitle}
        coverImage={coverImage}
        host={sp.host || null}
        port={portNum && !isNaN(portNum) ? portNum : null}
        serverName={sp.name || null}
        editionSlug={sp.edition || null}
        eventId={sp.eventId || null}
        action={sp.action || (sp.host ? "join" : "play")}
      />
    </div>
  );
}
