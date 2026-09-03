"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, ExternalLink, FolderOpen, Play, Trash2, Users } from "lucide-react";
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

/**
 * Which games have their editions open, remembered across navigations.
 *
 * The launcher keeps the same thing under the same name, for the same reason:
 * a library is a list you come back to, and re-opening the one game you were
 * looking at every time is a small tax paid constantly. Failures are ignored —
 * private windows and blocked storage both throw, and neither is a reason for
 * the page not to render.
 */
const EXPANDED_EDITIONS_KEY = "playbound_library_expanded_editions";

/*
 * Parsed once and kept, because useSyncExternalStore calls the snapshot on
 * every render and re-reading localStorage each time would be wasteful — and
 * a snapshot that allocates a fresh Set each call makes React re-render for
 * ever, since it compares by identity.
 */
let expandedCache: Set<string> | null = null;
const expandedListeners = new Set<() => void>();

function readExpandedEditions(): Set<string> {
  if (expandedCache) return expandedCache;
  try {
    const raw = window.localStorage.getItem(EXPANDED_EDITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    expandedCache = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    // Private windows and blocked site data both throw here. Neither is a
    // reason for the library not to render.
    expandedCache = new Set();
  }
  return expandedCache;
}

function writeExpandedEditions(next: Set<string>) {
  expandedCache = next;
  try {
    window.localStorage.setItem(EXPANDED_EDITIONS_KEY, JSON.stringify([...next]));
  } catch {
    /* storage is a convenience here, never a requirement */
  }
  for (const listener of expandedListeners) listener();
}

function subscribeExpanded(onChange: () => void) {
  expandedListeners.add(onChange);
  return () => {
    expandedListeners.delete(onChange);
  };
}

function useExpandedEditions(slug: string) {
  const open = useSyncExternalStore(
    subscribeExpanded,
    () => readExpandedEditions().has(slug),
    // Closed on the server, so the first client render agrees with it and the
    // stored value is applied on hydration.
    () => false
  );

  function toggle() {
    const next = new Set(readExpandedEditions());
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    writeExpandedEditions(next);
  }

  return [open, toggle] as const;
}

/**
 * Two columns that scroll past each other, rather than a grid.
 *
 * A CSS grid aligns rows, so the taller of two side-by-side cards sets the
 * height of both: opening one game's editions pushed the game beside it down
 * and left a gap under it. Each column is its own stack, so opening a card only
 * moves what is below it in that column. The launcher's library does the same
 * and carries the same note.
 *
 * Round-robin rather than first-half/second-half, because it preserves the
 * left-to-right reading order the grid had — splitting in halves would move
 * every card somewhere else the first time this shipped.
 */
const TWO_COLUMN_QUERY = "(min-width: 1024px)";

function useColumnCount(): number {
  // One on the server and on first paint. Anything else would have to guess a
  // viewport width during SSR and be wrong for half of them.
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(TWO_COLUMN_QUERY);
    const apply = () => setCount(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return count;
}

function distribute<T>(items: T[], columns: number): T[][] {
  const out: T[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => out[i % columns].push(item));
  return out;
}

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

/**
 * "Join Multiplayer" — into a server that actually has a game happening.
 *
 * The server is chosen on click rather than on render. Deciding it for every
 * card up front would poll every master server in the catalog on every library
 * view, and the answer is stale within seconds regardless.
 *
 * The button hides itself once it knows this game has no command-line join, so
 * it never promises a one-click join it would have to deliver as "here is an
 * address, type it in yourself". That check comes back with the server lookup:
 * asking first would be a second round trip to hide a button nobody clicked.
 *
 * Actually joining is the launcher's job — the browser cannot start a game —
 * so this opens the same playbound://join link the launcher already handles.
 */
function JoinMultiplayerButton({
  slug,
  title,
  className,
}: {
  slug: string;
  title: string;
  className: string;
}) {
  const [state, setState] = useState<"idle" | "finding" | "hidden">("idle");
  const [note, setNote] = useState<string | null>(null);

  if (state === "hidden") return null;

  async function join() {
    setState("finding");
    setNote(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(slug)}/best-server`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("lookup failed");
      const data = (await res.json()) as {
        canDirectJoin?: boolean;
        server?: { name?: string; players?: number; maxPlayers?: number } | null;
        joinUrl?: string;
        reason?: string;
      };

      if (!data.canDirectJoin) {
        // Nothing to offer for this game — take the button away rather than
        // leaving one that will fail the same way on every press.
        setState("hidden");
        return;
      }
      if (!data.server || !data.joinUrl) {
        setNote(
          data.reason === "no-servers"
            ? "No servers listed right now"
            : "No server with enough players nearby"
        );
        setState("idle");
        return;
      }
      window.location.href = data.joinUrl;
      setState("idle");
    } catch {
      setNote("Couldn't check servers");
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={join}
        disabled={state === "finding"}
        className={cn(className, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
        title={`Find a busy ${title} server and join it`}
      >
        <Users className="size-3" /> {state === "finding" ? "Finding…" : "Join Multiplayer"}
      </button>
      {note ? <span className="text-[11px] text-muted-foreground">{note}</span> : null}
    </>
  );
}

/**
 * Uninstall from this PC, for a whole game.
 *
 * Shared rather than inlined because a game with editions needs it too, and it
 * had simply been left out of that card: editions offered Folder, Locate and
 * Remove, so the only way to get the files off the disk was to remove the game
 * from the library entirely and then not have it listed anywhere.
 *
 * The watcher is what makes the card disappear. The launcher does the work out
 * of process, so there is nothing to await — the page polls the library until
 * the game stops coming back.
 */
function UninstallFromPcButton({
  slug,
  className,
  onGone,
}: {
  slug: string;
  className?: string;
  onGone?: () => void;
}) {
  const router = useRouter();
  const stopWatch = useRef<(() => void) | null>(null);

  useEffect(() => () => stopWatch.current?.(), []);

  function uninstallFromPc() {
    stopWatch.current?.();
    stopWatch.current = startPcUninstall({
      kind: "game",
      slug,
      deepLink: launcherUninstallUrl(slug),
      onGone: () => {
        onGone?.();
        router.refresh();
      },
    });
  }

  return (
    <button
      type="button"
      onClick={uninstallFromPc}
      className={className}
      title="Uninstall from this PC via the PlayBound app"
    >
      Uninstall from PC
    </button>
  );
}

function DesktopInstalledActions({
  slug,
  editionSlug,
  title,
}: {
  slug: string;
  editionSlug?: string | null;
  title: string;
}) {
  const [hidden, setHidden] = useState(false);
  const chip =
    "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold";

  if (hidden) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={launcherPlayUrl(slug, editionSlug)}
        className={cn(chip, "bg-play text-play-foreground hover:brightness-110")}
      >
        <Play className="size-3 fill-current" /> Play
      </a>
      <JoinMultiplayerButton slug={slug} title={title} className={chip} />
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
      <UninstallFromPcButton
        slug={slug}
        onGone={() => setHidden(true)}
        className={cn(chip, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
      />
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
  const [editionsOpen, toggleEditions] = useExpandedEditions(game.slug);

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
          <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-2.5">
            {/*
              * Collapsed by default, like the launcher's. A game with six
              * editions otherwise makes a card three times the height of its
              * neighbours before anyone has asked to see them.
              */}
            <button
              type="button"
              onClick={toggleEditions}
              aria-expanded={editionsOpen}
              className="flex w-full items-center justify-between gap-1 rounded-lg text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>Editions ({editions.length})</span>
              <ChevronDown
                className={cn("size-3.5 shrink-0 transition-transform", editionsOpen && "rotate-180")}
              />
            </button>
            <div className={cn("mt-1.5 space-y-1.5", !editionsOpen && "hidden")}>
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
                        <>
                          <a
                            href={launcherPlayUrl(game.slug, ed.slug)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-full bg-play px-2.5 text-[11px] font-bold text-play-foreground hover:brightness-110"
                          >
                            <Play className="size-3 fill-current" /> Play
                          </a>
                          {/*
                            * Scoped to this edition. A plain link rather than
                            * the watched button below it, because the game
                            * stays in the library when one of several editions
                            * goes — there is no "gone" for the watcher to see.
                            */}
                          <a
                            href={launcherUninstallUrl(game.slug, ed.slug)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-bold text-secondary-foreground hover:bg-secondary/70"
                            title={`Uninstall ${ed.name} from this PC`}
                          >
                            <Trash2 className="size-3" /> Uninstall
                          </a>
                        </>
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
              {installed && showLauncherActions ? (
                <UninstallFromPcButton
                  slug={game.slug}
                  className="inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-bold text-secondary-foreground hover:bg-secondary/70"
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-3 flex flex-wrap gap-2">
            {installed && showLauncherActions ? (
              <DesktopInstalledActions
                slug={game.slug}
                editionSlug={editions[0]?.slug}
                title={game.title}
              />
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

  const columnCount = useColumnCount();

  /*
   * One ordered list, built once, then dealt into columns. Games first and
   * orphans after, which is the order the grid showed them in — the layout
   * changed, the reading order did not.
   */
  const desktopCards: { key: string; node: React.ReactNode }[] = [
    ...visibleGames.map((game) => ({
      key: game.slug,
      node: (
        <DesktopLibraryRow
          key={game.slug}
          game={game}
          meta={bySlug.get(game.slug)}
          mods={modsByBase[game.slug] || []}
          showLauncherActions={showLauncherActions}
          editions={editionsByGame[game.slug] || []}
        />
      ),
    })),
    ...visibleOrphans.map((entry) => {
      const title = entry.gameSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return {
        key: entry.gameSlug,
        node: (
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
                  <DesktopInstalledActions slug={entry.gameSlug} title={entry.gameSlug} />
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
        ),
      };
    }),
  ];


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

          {/*
            * Desktop / tablet: independent columns, not a grid. See
            * useColumnCount for why the row alignment had to go.
            */}
          <div className="hidden gap-4 sm:flex sm:flex-col lg:flex-row lg:items-start">
            {distribute(desktopCards, columnCount).map((column, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
                {column.map((card) => card.node)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
