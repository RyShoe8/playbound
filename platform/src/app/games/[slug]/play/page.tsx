import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, MonitorPlay, Server } from "lucide-react";
import { developersBySlug, getGame } from "@/lib/catalog";
import { isBrowserGame } from "@/lib/gameLaunch";
import { isOneClickSlug, launcherInstallUrl } from "@/lib/launcher";
import { GameArt } from "@/components/GameArt";
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

  const developer = developersBySlug.get(game.developerSlug);
  const oneClick = isOneClickSlug(game.slug);
  const browser = isBrowserGame(game);
  const host = (() => {
    try {
      return new URL(game.website).hostname.replace(/^www\./, "");
    } catch {
      return game.website;
    }
  })();

  if (browser) {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <Link
            href={`/games/${game.slug}`}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to {game.title}
          </Link>
          <Badge tone="play">
            <MonitorPlay className="size-3" /> Instant
          </Badge>
        </div>
        <div className="relative overflow-hidden">
          <GameArt game={game} showTitle={false} className="absolute inset-0" />
          <div className="absolute inset-0 bg-background/85" />
          <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <MonitorPlay className="size-10 text-primary" />
            <h1 className="text-2xl font-extrabold">Play {game.title} in your browser</h1>
            <p className="text-sm text-muted-foreground">
              No download or launcher needed — {game.title} runs on the web. Opens on the official site
              ({host}).
            </p>
            <a
              href={game.website}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-2 rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
            >
              <ExternalLink className="size-4" /> Play Free on {host}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link
          href={`/games/${game.slug}`}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to {game.title}
        </Link>
        <Badge tone="brand">
          <Download className="size-3" /> Install
        </Badge>
      </div>
      <div className="relative overflow-hidden">
        <GameArt game={game} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-background/85" />
        <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <Download className="size-10 text-primary" />
          <h1 className="text-2xl font-extrabold">Install {game.title} for free</h1>
          <p className="text-sm text-muted-foreground">
            {game.title} is {game.license.toLowerCase()}. Download it directly from the official
            project, or let the PlayBound Launcher grab the latest build automatically —{" "}
            {game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`}{" "}
            download.
          </p>
          <a
            href={developer?.website ?? game.website}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            <Download className="size-4" /> Download from {host}
          </a>
          {oneClick ? (
            <>
              <a
                href={launcherInstallUrl(game.slug)}
                className="rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-bold transition-colors hover:bg-secondary/70"
              >
                One-click install with the PlayBound Launcher →
              </a>
              <Link href="/launcher" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                Need the launcher?
              </Link>
            </>
          ) : (
            <Link
              href="/launcher"
              className="rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-bold transition-colors hover:bg-secondary/70"
            >
              Get the PlayBound Launcher →
            </Link>
          )}
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
