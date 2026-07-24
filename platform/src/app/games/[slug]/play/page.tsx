import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MonitorPlay, Rocket, Server } from "lucide-react";
import { getGame } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Badge } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  return { title: game ? `Play ${game.title}` : "Play" };
}

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const backBar = (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <Link
        href={`/games/${game.slug}`}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to {game.title}
      </Link>
      <Badge tone={game.browserPlayable ? "play" : "brand"}>
        {game.browserPlayable ? (
          <>
            <MonitorPlay className="size-3" /> Browser Play
          </>
        ) : (
          <>
            <Download className="size-3" /> PlayBound Install
          </>
        )}
      </Badge>
    </div>
  );

  if (game.browserPlayable) {
    return (
      <div>
        {backBar}
        <div className="relative overflow-hidden">
          <GameArt game={game} showTitle={false} className="absolute inset-0" />
          <div className="absolute inset-0 bg-background/85" />
          <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <Rocket className="size-10 text-play" />
            <h1 className="text-2xl font-extrabold">{game.title} is almost ready</h1>
            <p className="text-sm text-muted-foreground">
              The browser runtime for this title is in final testing. When it goes live, this page
              becomes the game — no install, no launcher, playing in seconds.
            </p>
            <button className="mt-2 rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground opacity-60" disabled>
              Launching soon
            </button>
            <Link href="/discover" className="text-sm font-semibold text-primary hover:underline">
              Browse more games while you wait →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {backBar}
      <div className="relative overflow-hidden">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-background/85" />
        <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <Download className="size-10 text-primary" />
          <h1 className="text-2xl font-extrabold">Install {game.title} with one click</h1>
          <p className="text-sm text-muted-foreground">
            The PlayBound Launcher downloads, configures, and keeps {game.title} updated
            automatically. After the first install, every future launch is a single click —{" "}
            {game.sizeMB && game.sizeMB >= 1000
              ? `${(game.sizeMB / 1000).toFixed(1)} GB`
              : `${game.sizeMB} MB`}{" "}
            download.
          </p>
          <button className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
            Get the PlayBound Launcher (beta)
          </button>
          {game.launchMethods.includes("server") && (
            <Link
              href={`/games/${game.slug}?tab=servers`}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <Server className="size-3.5" /> Or browse {game.activeServers} live servers
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
