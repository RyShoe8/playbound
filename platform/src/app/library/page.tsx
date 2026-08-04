import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { LibraryBig, LogIn } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { gamesFor } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { LibraryGrid } from "@/components/LibraryGrid";
import { EmptyHint } from "@/components/ui/bits";

export const metadata: Metadata = {
  title: "Library",
  // Personal / auth route — must never be indexed.
  robots: { index: false, follow: false },
};

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

  let entries: { gameSlug: string; installed: boolean; saved: boolean }[] = [];
  let modEntries: { modSlug: string; baseGameSlug: string }[] = [];
  try {
    await dbConnect();
    const [rows, modRows] = await Promise.all([
      LibraryEntry.find({
        userId: session.user.id,
        $or: [{ installed: true }, { saved: true }],
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
      installed: Boolean(r.installed),
      saved: Boolean(r.saved) && !r.installed,
    }));
    modEntries = modRows.map((r) => ({
      modSlug: String(r.modSlug),
      baseGameSlug: String(r.baseGameSlug),
    }));
  } catch (err) {
    console.error("Library page load failed:", err);
  }

  const games = await gamesFor(entries.map((e) => e.gameSlug));
  const knownSlugs = new Set(games.map((g) => g.slug));
  const orphanEntries = entries.filter((e) => !knownSlugs.has(e.gameSlug));
  const hasAny = entries.length > 0;

  const allMods = await listMods();
  const modBySlug = new Map(allMods.map((m) => [m.slug, m]));
  const modsByBase: Record<string, { slug: string; title: string }[]> = {};
  for (const entry of modEntries) {
    const mod = modBySlug.get(entry.modSlug);
    const title = mod?.title || entry.modSlug;
    const list = modsByBase[entry.baseGameSlug] || [];
    list.push({ slug: entry.modSlug, title });
    modsByBase[entry.baseGameSlug] = list;
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
        <LibraryGrid
          games={games}
          entries={entries}
          orphans={orphanEntries}
          modsByBase={modsByBase}
        />
      )}
    </div>
  );
}
