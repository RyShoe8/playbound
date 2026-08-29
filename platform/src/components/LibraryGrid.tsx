"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FolderOpen, Play, Trash2 } from "lucide-react";
import type { Game } from "@/lib/data/types";
import {
  launcherInstallUrl,
  launcherLocateUrl,
  launcherOpenFolderUrl,
  launcherPlayUrl,
  launcherUninstallUrl,
} from "@/lib/launcher";
import { startPcUninstall } from "@/lib/watchLibraryGone";
import { GameArt } from "@/components/GameArt";
import { CardCategoryTags } from "@/components/CardCategoryTags";
import { LibraryModsDisclosure, type LibraryModItem } from "@/components/LibraryModsDisclosure";
import { LibraryDeviceHint } from "@/components/LibraryDeviceHint";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { shouldOfferLauncher, resolveMobileOutbound, parseMobileOs } from "@/lib/mobilePlay";
import { MobileOutboundCta } from "@/components/MobileOutboundCta";
import { cn } from "@/lib/utils";

export type LibraryEditionItem = {
  slug: string;
  name: string;
  type?: string;
  isDefault?: boolean;
};

export type LibraryEntryMeta = {
  gameSlug: string;
  installed: boolean;
  saved: boolean;
  ownedElsewhere?: boolean;
  editionSlug?: string | null;
  installedEditions?: string[];
};

export type LibraryOrphan = {
  gameSlug: string;
  installed: boolean;
  saved: boolean;
  ownedElsewhere?: boolean;
};

function RemoveFromLibraryButton({
  slug,
  className,
  label = "Remove",
  onRemoved,
}: {
  slug: string;
  className?: string;
  label?: string;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/library?slug=${encodeURIComponent(slug)}&allPlatforms=1`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setRemoving(false);
        return;
      }
      onRemoved?.();
      router.refresh();
    } catch {
      setRemoving(false);
    }
  }

  return (
    <button
      type="button"
      disabled={removing}
      onClick={handleRemove}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-colors",
        className
      )}
      title="Remove from library"
    >
      <Trash2 className="size-3" /> {removing ? "Removing…" : label}
    </button>
  );
}

function DesktopInstalledActions({ slug, editionSlug }: { slug: string; editionSlug?: string | null }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);
  const chip =
    "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold";

  useEffect(() => () => stopWatch.current?.(), []);

  function uninstallFromPc() {
    stopWatch.current?.();
    stopWatch.current = startPcUninstall({
      kind: "game",
      slug,
      deepLink: launcherUninstallUrl(slug),
      onGone: () => {
        setHidden(true);
        router.refresh();
      },
    });
  }

  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={launcherPlayUrl(slug, editionSlug)}
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
      <RemoveFromLibraryButton slug={slug} onRemoved={() => setHidden(true)} />
      <button
        type="button"
        onClick={uninstallFromPc}
        className={cn(chip, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
        title="Uninstall from this PC via the PlayBound app"
      >
        Uninstall from PC
      </button>
    </div>
  );
}

function StatusBadges({
  installed,
  saved,
  ownedElsewhere,
  game,
}: {
  installed: boolean;
  saved: boolean;
  ownedElsewhere?: boolean;
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
      {ownedElsewhere && !installed && (
        <Badge tone="brand">On another device</Badge>
      )}
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
  const ownedElsewhere = Boolean(meta?.ownedElsewhere) && !installed;
  const [os, setOs] = useState<"android" | "ios" | "other">("other");

  useEffect(() => {
    setOs(parseMobileOs(navigator.userAgent));
  }, []);

  const outbound = resolveMobileOutbound(game, os);

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
          <StatusBadges
            installed={installed}
            saved={saved}
            ownedElsewhere={ownedElsewhere}
            game={game}
          />
          <CardCategoryTags genres={game.genres} tags={game.tags} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        {installed ? (
          <MobileOutboundCta
            game={game}
            outbound={outbound}
            surface="library_mobile"
            skipLibraryClaim
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-play px-3 text-sm font-bold text-play-foreground"
          >
            <Play className="size-3.5 fill-current" /> Play
          </MobileOutboundCta>
        ) : ownedElsewhere ? (
          <MobileOutboundCta
            game={game}
            outbound={outbound}
            surface="library_mobile_install"
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground"
          >
            <Download className="size-3.5" /> Install
          </MobileOutboundCta>
        ) : null}
        <Link
          href={`/games/${game.slug}`}
          className={cn(
            "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-bold",
            installed || ownedElsewhere ? "flex-none" : "flex-1"
          )}
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
          <StatusBadges
            installed={entry.installed}
            saved={entry.saved}
            ownedElsewhere={entry.ownedElsewhere}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <RemoveFromLibraryButton
          slug={entry.gameSlug}
          label="Remove from Library"
          className="min-h-9 flex-1 justify-center !text-sm"
        />
      </div>
      {mods.length > 0 && (
        <div className="mt-2">
          <LibraryModsDisclosure mods={mods} />
        </div>
      )}
    </article>
  );
}

function MobileOwnedElsewhereInstall({ game }: { game: Game }) {
  const [os, setOs] = useState<"android" | "ios" | "other">("other");
  useEffect(() => {
    setOs(parseMobileOs(navigator.userAgent));
  }, []);
  const outbound = resolveMobileOutbound(game, os);
  return (
    <MobileOutboundCta
      game={game}
      outbound={outbound}
      surface="library_install"
      className="inline-flex min-h-8 items-center justify-center gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground"
    >
      <Download className="size-3" /> Install
    </MobileOutboundCta>
  );
}

function DesktopLibraryRow({
  game,
  meta,
  mods,
  showLauncherActions,
  editions = [],
}: {
  game: Game;
  meta?: LibraryEntryMeta;
  mods: LibraryModItem[];
  showLauncherActions: boolean;
  editions?: LibraryEditionItem[];
}) {
  const installed = Boolean(meta?.installed);
  const saved = Boolean(meta?.saved);
  const ownedElsewhere = Boolean(meta?.ownedElsewhere) && !installed;

  const installedEditionsList =
    Array.isArray(meta?.installedEditions) && meta.installedEditions.length > 0
      ? meta.installedEditions
      : meta?.installed
      ? [meta.editionSlug || "official"]
      : [];
  const installedEditionsSet = new Set(installedEditionsList);

  const hasMultipleEditions = editions.length > 1;

  return (
    <article className="flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
      <Link href={`/games/${game.slug}`} className="relative w-28 shrink-0 overflow-hidden rounded-lg shadow-sm transition-transform hover:scale-105">
        <GameArt game={game} className="aspect-[3/4]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/games/${game.slug}`} className="block truncate text-xl font-bold hover:underline">
              {game.title}
            </Link>
            <p className="truncate text-sm text-muted-foreground">{game.genres.join(" · ")}</p>
          </div>
          <CardCategoryTags genres={game.genres} tags={game.tags} />
        </div>
        <div className="mt-2">
          <StatusBadges
            installed={installed}
            saved={saved}
            ownedElsewhere={ownedElsewhere}
            game={game}
          />
        </div>

        {hasMultipleEditions && showLauncherActions ? (
          <div className="mt-3 space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Editions ({editions.length})
            </div>
            <div className="space-y-1.5">
              {editions.map((ed) => {
                const isEdInstalled = installedEditionsSet.has(ed.slug);
                return (
                  <div
                    key={ed.slug}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/70 px-3 py-1.5 text-xs border border-border/40"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold truncate text-foreground">{ed.name}</span>
                      {ed.isDefault ? (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Official
                        </span>
                      ) : null}
                      {isEdInstalled ? (
                        <span className="rounded bg-play/15 px-1.5 py-0.5 text-[10px] font-semibold text-play">
                          Installed
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEdInstalled ? (
                        <a
                          href={launcherPlayUrl(game.slug, ed.slug)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-full bg-play px-2.5 text-[11px] font-bold text-play-foreground hover:brightness-110"
                        >
                          <Play className="size-3 fill-current" /> Play
                        </a>
                      ) : (
                        <a
                          href={launcherInstallUrl(game.slug, ed.slug)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-full bg-primary px-2.5 text-[11px] font-bold text-primary-foreground hover:brightness-110"
                        >
                          <Download className="size-3" /> Install
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {installed ? (
                <>
                  <a
                    href={launcherOpenFolderUrl(game.slug)}
                    className="inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-bold text-secondary-foreground hover:bg-secondary/70"
                    title="Open install folder"
                  >
                    <FolderOpen className="size-3" /> Folder
                  </a>
                  <a
                    href={launcherLocateUrl(game.slug)}
                    className="inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-bold text-secondary-foreground hover:bg-secondary/70"
                    title="Select .exe in the PlayBound app"
                  >
                    Locate
                  </a>
                </>
              ) : null}
              <RemoveFromLibraryButton slug={game.slug} className="!min-h-7" />
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-3 flex flex-wrap gap-2">
            {installed && showLauncherActions ? (
              <DesktopInstalledActions slug={game.slug} editionSlug={editions[0]?.slug} />
            ) : ownedElsewhere && showLauncherActions ? (
              <div className="flex flex-wrap items-center gap-2">
                <LauncherInstallButton
                  slug={game.slug}
                  label="Install on this PC"
                  className="!px-4 !py-1.5 !text-xs"
                />
                <RemoveFromLibraryButton slug={game.slug} />
              </div>
            ) : ownedElsewhere ? (
              <div className="flex flex-wrap items-center gap-2">
                <MobileOwnedElsewhereInstall game={game} />
                <RemoveFromLibraryButton slug={game.slug} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/games/${game.slug}`}
                  className="inline-flex min-h-8 items-center justify-center gap-1 rounded-full bg-secondary px-3 text-xs font-bold"
                >
                  <ExternalLink className="size-3" /> Open game
                </Link>
                <RemoveFromLibraryButton slug={game.slug} />
              </div>
            )}
          </div>
        )}

        {mods.length > 0 && (
          <div className="mt-2">
            <LibraryModsDisclosure mods={mods} />
          </div>
        )}
      </div>
    </article>
  );
}

export function LibraryGrid({
  games,
  entries,
  orphans,
  modsByBase,
  editionsByGame = {},
}: {
  games: Game[];
  entries: LibraryEntryMeta[];
  orphans: LibraryOrphan[];
  modsByBase: Record<string, LibraryModItem[]>;
  editionsByGame?: Record<string, LibraryEditionItem[]>;
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

          {/* Desktop / tablet list */}
          <div className="hidden flex-col gap-4 sm:flex lg:grid lg:grid-cols-2 xl:grid-cols-3">
            {visibleGames.map((game) => (
              <DesktopLibraryRow
                key={game.slug}
                game={game}
                meta={bySlug.get(game.slug)}
                mods={modsByBase[game.slug] || []}
                showLauncherActions={showLauncherActions}
                editions={editionsByGame[game.slug] || []}
              />
            ))}
            {visibleOrphans.map((entry) => {
              const title = entry.gameSlug
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
              return (
                <article
                  key={entry.gameSlug}
                  className="flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex w-28 shrink-0 items-center justify-center rounded-lg bg-secondary text-4xl font-extrabold text-muted-foreground shadow-sm">
                    {title.charAt(0)}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-xl font-bold">{title}</p>
                    <div className="mt-2">
                      <StatusBadges
                        installed={entry.installed}
                        saved={entry.saved}
                        ownedElsewhere={entry.ownedElsewhere}
                      />
                    </div>
                    <div className="mt-auto pt-3 flex flex-wrap gap-2">
                      {entry.installed && showLauncherActions ? (
                        <DesktopInstalledActions slug={entry.gameSlug} />
                      ) : (
                        <RemoveFromLibraryButton slug={entry.gameSlug} />
                      )}
                    </div>
                    {modsByBase[entry.gameSlug] && modsByBase[entry.gameSlug].length > 0 && (
                      <div className="mt-2">
                        <LibraryModsDisclosure mods={modsByBase[entry.gameSlug]} />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
