import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Download, LibraryBig, LogIn, MonitorPlay, Play, Puzzle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import User from "@/lib/models/User";
import { gamesFor } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { launcherPlayUrl } from "@/lib/launcher";
import { GameCard } from "@/components/GameCard";
import { ConnectLauncherPanel } from "@/components/ConnectLauncherPanel";
import { Badge, EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Library",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

type Filter = "all" | "saved" | "installed";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; linked?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { filter: raw } = await searchParams;
  const filter: Filter = raw === "saved" || raw === "installed" ? raw : "all";

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <LibraryBig className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to see your library</h1>
        <p className="text-sm text-muted-foreground">
          Save games from the site and sync installs from the PlayBound Launcher — all in one place.
        </p>
        <Link
          href="/login?callbackUrl=/library"
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <LogIn className="size-4" /> Sign In
        </Link>
        <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </div>
    );
  }

  let entries: { gameSlug: string; saved: boolean; installed: boolean }[] = [];
  let modEntries: { modSlug: string; baseGameSlug: string }[] = [];
  let launcherConnected = false;
  let launcherCreatedAt: string | null = null;
  try {
    await dbConnect();
    const [rows, modRows, user] = await Promise.all([
      LibraryEntry.find({
        userId: session.user.id,
        $or: [{ saved: true }, { installed: true }],
      })
        .sort({ updatedAt: -1 })
        .lean(),
      LibraryModEntry.find({
        userId: session.user.id,
        installed: true,
      })
        .sort({ updatedAt: -1 })
        .lean(),
      User.findById(session.user.id).select("+launcherTokenHash +launcherTokenCreatedAt").lean(),
    ]);
    entries = rows.map((r) => ({
      gameSlug: r.gameSlug,
      saved: Boolean(r.saved),
      installed: Boolean(r.installed),
    }));
    modEntries = modRows.map((r) => ({
      modSlug: String(r.modSlug),
      baseGameSlug: String(r.baseGameSlug),
    }));
    launcherConnected = Boolean(user?.launcherTokenHash);
    launcherCreatedAt = user?.launcherTokenCreatedAt
      ? new Date(user.launcherTokenCreatedAt).toISOString()
      : null;
  } catch (err) {
    console.error("Library page load failed:", err);
  }

  const filtered =
    filter === "saved"
      ? entries.filter((e) => e.saved)
      : filter === "installed"
        ? entries.filter((e) => e.installed)
        : entries;

  const bySlug = new Map(filtered.map((e) => [e.gameSlug, e]));
  const games = await gamesFor(filtered.map((e) => e.gameSlug));
  const knownSlugs = new Set(games.map((g) => g.slug));
  const orphanEntries = filtered.filter((e) => !knownSlugs.has(e.gameSlug));
  const hasAny = entries.length > 0;
  const hasInstalled = entries.some((e) => e.installed);
  const hasVisible = games.length > 0 || orphanEntries.length > 0;

  const allMods = await listMods();
  const modBySlug = new Map(allMods.map((m) => [m.slug, m]));
  const modsByBase = new Map<string, { slug: string; title: string }[]>();
  for (const entry of modEntries) {
    const mod = modBySlug.get(entry.modSlug);
    const title = mod?.title || entry.modSlug;
    const list = modsByBase.get(entry.baseGameSlug) || [];
    list.push({ slug: entry.modSlug, title });
    modsByBase.set(entry.baseGameSlug, list);
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "saved", label: "Saved" },
    { key: "installed", label: "Installed" },
  ];

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="mt-1 text-muted-foreground">
          Games you saved on PlayBound and installs synced from the launcher — including mods under
          each game.
        </p>
      </div>

      <Suspense fallback={null}>
        <ConnectLauncherPanel
          initiallyConnected={launcherConnected}
          initiallyCreatedAt={launcherCreatedAt}
        />
      </Suspense>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={c.key === "all" ? "/library" : `/library?filter=${c.key}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              filter === c.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {!hasAny ? (
        <div className="space-y-4">
          <EmptyHint icon={LibraryBig}>
            {launcherConnected
              ? "No games here yet. Install a game with the launcher, or hit Refresh above if you just connected — synced installs should show up shortly."
              : "Your library is empty. Save games from any game page, or connect the launcher to sync installs."}
          </EmptyHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/discover"
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Browse Discover
            </Link>
            {!launcherConnected && (
              <a
                href={process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL || "/launcher"}
                className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
              >
                Download the Launcher
              </a>
            )}
          </div>
        </div>
      ) : !hasVisible ? (
        <EmptyHint icon={MonitorPlay}>
          No games match this filter.
          {!hasInstalled && filter === "installed"
            ? launcherConnected
              ? " Install a game with the launcher, then refresh."
              : " Connect the launcher and install a game to see it here."
            : ""}
        </EmptyHint>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-5">
          {games.map((game) => {
            const meta = bySlug.get(game.slug);
            const gameMods = modsByBase.get(game.slug) || [];
            return (
              <div key={game.slug} className="space-y-2">
                <GameCard game={game} />
                <div className="flex flex-wrap items-center gap-1 px-0.5">
                  {meta?.saved && (
                    <Badge tone="brand">
                      <LibraryBig className="size-3" /> Saved
                    </Badge>
                  )}
                  {meta?.installed && (
                    <Badge tone="play">
                      <Download className="size-3" /> Installed
                    </Badge>
                  )}
                  {meta?.installed && (
                    <a
                      href={launcherPlayUrl(game.slug)}
                      className="inline-flex items-center gap-1 rounded-full bg-play px-2.5 py-0.5 text-[11px] font-bold text-play-foreground hover:brightness-110"
                    >
                      <Play className="size-3 fill-current" /> Play
                    </a>
                  )}
                </div>
                {gameMods.length > 0 && (
                  <ul className="space-y-1 px-0.5">
                    {gameMods.map((m) => (
                      <li key={m.slug} className="flex max-w-[200px] items-center gap-1.5">
                        <Link
                          href={`/mods/${m.slug}`}
                          className="inline-flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          <Puzzle className="size-3 shrink-0 text-primary" />
                          <span className="truncate">{m.title}</span>
                        </Link>
                        <a
                          href={launcherPlayUrl(game.slug)}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-play px-2 py-0.5 text-[10px] font-bold text-play-foreground hover:brightness-110"
                          title={`Play ${game.title}`}
                        >
                          <Play className="size-2.5 fill-current" /> Play
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {orphanEntries.map((entry) => {
            const title = entry.gameSlug
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            const gameMods = modsByBase.get(entry.gameSlug) || [];
            return (
              <div
                key={entry.gameSlug}
                className="w-[160px] space-y-2 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-secondary text-2xl font-extrabold text-muted-foreground">
                  {title.charAt(0)}
                </div>
                <p className="truncate text-sm font-bold">{title}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {entry.saved && (
                    <Badge tone="brand">
                      <LibraryBig className="size-3" /> Saved
                    </Badge>
                  )}
                  {entry.installed && (
                    <Badge tone="play">
                      <Download className="size-3" /> Installed
                    </Badge>
                  )}
                  {entry.installed && (
                    <a
                      href={launcherPlayUrl(entry.gameSlug)}
                      className="inline-flex items-center gap-1 rounded-full bg-play px-2.5 py-0.5 text-[11px] font-bold text-play-foreground hover:brightness-110"
                    >
                      <Play className="size-3 fill-current" /> Play
                    </a>
                  )}
                </div>
                {gameMods.length > 0 && (
                  <ul className="space-y-1">
                    {gameMods.map((m) => (
                      <li key={m.slug} className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">
                          {m.title}
                        </span>
                        <a
                          href={launcherPlayUrl(entry.gameSlug)}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-play px-2 py-0.5 text-[10px] font-bold text-play-foreground hover:brightness-110"
                          title={`Play ${title}`}
                        >
                          <Play className="size-2.5 fill-current" /> Play
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasAny && !hasInstalled && !launcherConnected && filter !== "installed" && (
        <p className="text-sm text-muted-foreground">
          Tip: connect the launcher above so installs appear here automatically.{" "}
          <Link href="/launcher" className="font-semibold text-primary hover:underline">
            Launcher page →
          </Link>
        </p>
      )}
    </div>
  );
}
