"use client";

import Link from "next/link";
import { Download, ExternalLink, FolderOpen, Play, Trash2 } from "lucide-react";
import type { Game } from "@/lib/data/types";
import {
  launcherLocateUrl,
  launcherOpenFolderUrl,
  launcherPlayUrl,
  launcherUninstallUrl,
} from "@/lib/launcher";
import { GameArt } from "@/components/GameArt";
import { GameCard } from "@/components/GameCard";
import { GamePlatformBadges } from "@/components/GamePlatformBadges";
import { LibraryModsDisclosure, type LibraryModItem } from "@/components/LibraryModsDisclosure";
import { LibraryDeviceHint } from "@/components/LibraryDeviceHint";
import { CompatibilityListingBar } from "@/components/GameCompatibilityToggle";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { shouldOfferLauncher } from "@/lib/mobilePlay";
import { cn } from "@/lib/utils";

export type LibraryEntryMeta = {
  gameSlug: string;
  installed: boolean;
  saved: boolean;
};

export type LibraryOrphan = {
  gameSlug: string;
  installed: boolean;
  saved: boolean;
};

function DesktopInstalledActions({ slug }: { slug: string }) {
  const chip =
    "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={launcherPlayUrl(slug)}
        className={cn(chip, "bg-play text-play-foreground hover:brightness-110")}
      >
        <Play className="size-3 fill-current" /> Play
      </a>
      <a
        href={launcherOpenFolderUrl(slug)}
        className={cn(chip, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
        title="Open install folder"
      >
        <FolderOpen className="size-3" /> Folder
      </a>
      <a
        href={launcherLocateUrl(slug)}
        className={cn(chip, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
        title="Select .exe in the PlayBound app"
      >
        Locate
      </a>
      <a
        href={launcherUninstallUrl(slug)}
        className={cn(chip, "bg-destructive/15 text-destructive hover:bg-destructive/25")}
        title="Uninstall"
      >
        <Trash2 className="size-3" /> Remove
      </a>
    </div>
  );
}

function StatusBadges({
  installed,
  saved,
  game,
}: {
  installed: boolean;
  saved: boolean;
  game?: Game;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {installed && (
        <Badge tone="play">
          <Download className="size-3" /> Installed
        </Badge>
      )}
      {saved && !installed && <Badge tone="brand">Play Later</Badge>}
      {game ? <LibraryDeviceHint game={game} /> : null}
    </div>
  );
}

function MobileLibraryRow({
  game,
  meta,
  mods,
}: {
  game: Game;
  meta?: LibraryEntryMeta;
  mods: LibraryModItem[];
}) {
  const installed = Boolean(meta?.installed);
  const saved = Boolean(meta?.saved);

  return (
    <article className="rounded-xl border border-border bg-card p-3">
      <div className="flex gap-3">
        <Link href={`/games/${game.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg">
          <GameArt game={game} showTitle={false} iconSize="sm" className="size-20" />
        </Link>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link href={`/games/${game.slug}`} className="block truncate text-base font-bold hover:underline">
            {game.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{game.genres.join(" · ")}</p>
          <StatusBadges installed={installed} saved={saved} game={game} />
          <GamePlatformBadges game={game} compact singleLine />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Link
          href={`/games/${game.slug}`}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-bold"
        >
          <ExternalLink className="size-3.5" /> Open
        </Link>
      </div>
      <div className="mt-2">
        <LibraryModsDisclosure mods={mods} />
      </div>
    </article>
  );
}

function MobileOrphanRow({
  entry,
  mods,
}: {
  entry: LibraryOrphan;
  mods: LibraryModItem[];
}) {
  const title = entry.gameSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <article className="rounded-xl border border-border bg-card p-3">
      <div className="flex gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl font-extrabold text-muted-foreground">
          {title.charAt(0)}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-base font-bold">{title}</p>
          <StatusBadges installed={entry.installed} saved={entry.saved} />
        </div>
      </div>
      <div className="mt-2">
        <LibraryModsDisclosure mods={mods} />
      </div>
    </article>
  );
}

function DesktopLibraryCard({
  game,
  meta,
  mods,
  showLauncherActions,
}: {
  game: Game;
  meta?: LibraryEntryMeta;
  mods: LibraryModItem[];
  showLauncherActions: boolean;
}) {
  const installed = Boolean(meta?.installed);
  const saved = Boolean(meta?.saved);

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <GameCard game={game} className="w-full sm:w-full" />
      <StatusBadges installed={installed} saved={saved} game={game} />
      {installed && showLauncherActions ? (
        <DesktopInstalledActions slug={game.slug} />
      ) : (
        <Link
          href={`/games/${game.slug}`}
          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-full bg-secondary px-3 text-xs font-bold"
        >
          <ExternalLink className="size-3" /> Open game
        </Link>
      )}
      <LibraryModsDisclosure mods={mods} />
    </div>
  );
}

export function LibraryGrid({
  games,
  entries,
  orphans,
  modsByBase,
}: {
  games: Game[];
  entries: LibraryEntryMeta[];
  orphans: LibraryOrphan[];
  modsByBase: Record<string, LibraryModItem[]>;
}) {
  const { mode, device, setMode } = useCompatibilityFilter();
  const showLauncherActions = shouldOfferLauncher(device.type);
  const bySlug = new Map(entries.map((e) => [e.gameSlug, e]));

  const visibleGames =
    mode === "compatible"
      ? games.filter((g) => isGameCompatible(g, device.type))
      : games;
  // Orphans can't be classified — always keep them.
  const visibleOrphans = orphans;

  const emptyFiltered =
    mode === "compatible" && visibleGames.length === 0 && visibleOrphans.length === 0;

  return (
    <div className="space-y-4">
      <CompatibilityListingBar />

      {emptyFiltered ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            None of your library games are marked compatible with this device.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setMode("all")}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Show all games
            </button>
            <Link
              href="/discover"
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              Browse Discover
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile list */}
          <div className="space-y-3 sm:hidden">
            {visibleGames.map((game) => (
              <MobileLibraryRow
                key={game.slug}
                game={game}
                meta={bySlug.get(game.slug)}
                mods={modsByBase[game.slug] || []}
              />
            ))}
            {visibleOrphans.map((entry) => (
              <MobileOrphanRow
                key={entry.gameSlug}
                entry={entry}
                mods={modsByBase[entry.gameSlug] || []}
              />
            ))}
          </div>

          {/* Desktop / tablet grid */}
          <div className="hidden grid-cols-2 gap-5 sm:grid md:grid-cols-3 lg:grid-cols-4">
            {visibleGames.map((game) => (
              <DesktopLibraryCard
                key={game.slug}
                game={game}
                meta={bySlug.get(game.slug)}
                mods={modsByBase[game.slug] || []}
                showLauncherActions={showLauncherActions}
              />
            ))}
            {visibleOrphans.map((entry) => {
              const title = entry.gameSlug
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
              return (
                <div
                  key={entry.gameSlug}
                  className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-secondary text-2xl font-extrabold text-muted-foreground">
                    {title.charAt(0)}
                  </div>
                  <p className="truncate text-sm font-bold">{title}</p>
                  <StatusBadges installed={entry.installed} saved={entry.saved} />
                  {entry.installed && showLauncherActions ? (
                    <DesktopInstalledActions slug={entry.gameSlug} />
                  ) : null}
                  <LibraryModsDisclosure mods={modsByBase[entry.gameSlug] || []} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
