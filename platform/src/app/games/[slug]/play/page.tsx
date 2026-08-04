import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MonitorPlay, Server } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { getDeveloper } from "@/lib/developers";
import { isBrowserGame } from "@/lib/gameLaunch";
import { GameArt } from "@/components/GameArt";
import { PlayPageActions, PlayPageHeading } from "@/components/PlayPageActions";
import { Badge } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  return { title: game ? `Play ${game.title}` : "Play" };
}

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const developer = await getDeveloper(game.developerSlug);
  const browser = isBrowserGame(game);
  const officialHref = developer?.website ?? game.website;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link
          href={`/games/${game.slug}`}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to {game.title}
        </Link>
        <Badge tone={browser ? "play" : "brand"}>
          {browser ? (
            <>
              <MonitorPlay className="size-3" /> Instant
            </>
          ) : (
            <>
              <Download className="size-3" /> Install
            </>
          )}
        </Badge>
      </div>
      <div className="relative overflow-hidden">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-background/85" />
        <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <PlayPageHeading game={game} />
          <PlayPageActions game={game} officialHref={officialHref} />
          {game.launchMethods.includes("server") && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Server className="size-3.5" /> Supports dedicated servers for multiplayer
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
