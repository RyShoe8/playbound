import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Download, FolderOpen, LibraryBig, LogIn, Play, Trash2 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { gamesFor } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import {
  launcherLocateUrl,
  launcherOpenFolderUrl,
  launcherPlayUrl,
  launcherUninstallUrl,
} from "@/lib/launcher";
import { GameCard } from "@/components/GameCard";
import { LibraryModsDisclosure } from "@/components/LibraryModsDisclosure";
import { Badge, EmptyHint } from "@/components/ui/bits";

export const metadata: Metadata = {
  title: "Library",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

function InstalledActions({ slug }: { slug: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-0.5">
      <a
        href={launcherPlayUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-play px-2 py-0.5 text-[10px] font-bold text-play-foreground hover:brightness-110"
      >
        <Play className="size-2.5 fill-current" /> Play
      </a>
      <a
        href={launcherOpenFolderUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground hover:bg-secondary/70"
        title="Open install folder"
      >
        <FolderOpen className="size-2.5" /> Folder
      </a>
      <a
        href={launcherLocateUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground hover:bg-secondary/70"
        title="Select .exe in the PlayBound app"
      >
        Locate
      </a>
      <a
        href={launcherUninstallUrl(slug)}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/25"
        title="Uninstall"
      >
        <Trash2 className="size-2.5" /> Remove
      </a>
    </div>
  );
}

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <LibraryBig className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to see your library</h1>
        <p className="text-sm text-muted-foreground">
          Install with the PlayBound app, or add a catalog game you already own — synced to your account.
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

  let entries: { gameSlug: string; installed: boolean }[] = [];
  let modEntries: { modSlug: string; baseGameSlug: string }[] = [];
  try {
    await dbConnect();
    // Drop leftover wishlist-only rows (saved without install).
    await LibraryEntry.deleteMany({
      userId: session.user.id,
      installed: { $ne: true },
      saved: true,
    });
    const [rows, modRows] = await Promise.all([
      LibraryEntry.find({
        userId: session.user.id,
        installed: true,
      })
        .sort({ updatedAt: -1 })
        .lean(),
      LibraryModEntry.find({
        userId: session.user.id,
        installed: true,
      })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);
    entries = rows.map((r) => ({
      gameSlug: r.gameSlug,
      installed: true,
    }));
    modEntries = modRows.map((r) => ({
      modSlug: String(r.modSlug),
      baseGameSlug: String(r.baseGameSlug),
    }));
  } catch (err) {
    console.error("Library page load failed:", err);
  }

  const bySlug = new Map(entries.map((e) => [e.gameSlug, e]));
  const games = await gamesFor(entries.map((e) => e.gameSlug));
  const knownSlugs = new Set(games.map((g) => g.slug));
  const orphanEntries = entries.filter((e) => !knownSlugs.has(e.gameSlug));
  const hasAny = entries.length > 0;

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

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="mt-1 text-muted-foreground">
          Games installed with the PlayBound app or added from the catalog — including mods under each
          game.
        </p>
      </div>

      {!hasAny ? (
        <div className="space-y-4">
          <EmptyHint icon={LibraryBig}>
            Your library is empty. Install with the PlayBound app, or open a game page and add one you
            already own.
          </EmptyHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/discover"
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Browse Discover
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL || "/launcher"}
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              Download the Launcher
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-5">
          {games.map((game) => {
            const meta = bySlug.get(game.slug);
            const gameMods = modsByBase.get(game.slug) || [];
            return (
              <div key={game.slug} className="w-44 shrink-0 space-y-2 sm:w-48">
                <GameCard game={game} />
                {meta?.installed && (
                  <div className="flex flex-wrap items-center gap-1 px-0.5">
                    <Badge tone="play">
                      <Download className="size-3" /> Installed
                    </Badge>
                  </div>
                )}
                {meta?.installed && <InstalledActions slug={game.slug} />}
                <LibraryModsDisclosure mods={gameMods} />
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
                className="w-44 shrink-0 space-y-2 rounded-xl border border-border bg-card p-3 sm:w-48"
              >
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-secondary text-2xl font-extrabold text-muted-foreground">
                  {title.charAt(0)}
                </div>
                <p className="truncate text-sm font-bold">{title}</p>
                {entry.installed && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone="play">
                      <Download className="size-3" /> Installed
                    </Badge>
                  </div>
                )}
                {entry.installed && <InstalledActions slug={entry.gameSlug} />}
                <LibraryModsDisclosure mods={gameMods} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
