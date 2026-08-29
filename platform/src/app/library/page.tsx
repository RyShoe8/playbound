import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getServerSession } from "next-auth/next";
import { LibraryBig, LogIn, Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { gamesFor, listGames } from "@/lib/catalog";
import { listPublicEditionsForGame } from "@/lib/editions";
import { isLauncherInstallable } from "@/lib/launcher";
import { listMods } from "@/lib/mods";
import { LibraryGrid } from "@/components/LibraryGrid";
import { AddGameButton } from "@/components/AddGameButton";
import { EmptyHint } from "@/components/ui/bits";
import {
  isLibraryPlatform,
  LIBRARY_PLATFORM_LABELS,
  platformFromUserAgent,
} from "@/lib/libraryPlatform";
import { buildLibraryUnionEntries } from "@/lib/libraryUnion";
import { shouldOfferLauncherFromUa } from "@/lib/mobilePlay";
import {
  detectLauncherOsFromUa,
  launcherDownloadUrlForOs,
} from "@/lib/launcherDownload";
import { canAccessTesting } from "@/lib/requestIncludesTesting";

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

  let entries: {
    gameSlug: string;
    installed: boolean;
    saved: boolean;
    ownedElsewhere: boolean;
  }[] = [];
  let modEntries: { modSlug: string; baseGameSlug: string }[] = [];
  /** Cross-platform-ineligible titles still owned only on other devices. */
  let hiddenElsewhereCount = 0;

  const userAgent = (await headers()).get("user-agent") || "";
  const viewerPlatform = platformFromUserAgent(userAgent);
  const offerLauncherDownload = shouldOfferLauncherFromUa(userAgent);
  const downloadUrl = launcherDownloadUrlForOs(detectLauncherOsFromUa(userAgent));

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

    const candidateSlugs = [...new Set(rows.map((r) => String(r.gameSlug)))];
    const catalogGames = await gamesFor(candidateSlugs, { includeUnpublished: true });
    const gamesBySlug = new Map(catalogGames.map((g) => [g.slug, g]));

    const union = buildLibraryUnionEntries(
      rows.map((r) => ({
        gameSlug: String(r.gameSlug),
        platform: r.platform as string | undefined,
        installed: Boolean(r.installed),
        saved: Boolean(r.saved),
        editionSlug: r.editionSlug ? String(r.editionSlug) : null,
        installedEditions: Array.isArray(r.installedEditions)
          ? r.installedEditions.map(String)
          : r.editionSlug
          ? [String(r.editionSlug)]
          : [],
      })),
      gamesBySlug,
      viewerPlatform
    );
    entries = union.entries;
    hiddenElsewhereCount = union.hiddenElsewhereCount;

    modEntries = modRows.map((r) => ({
      modSlug: String(r.modSlug),
      baseGameSlug: String(r.baseGameSlug),
    }));
  } catch (err) {
    console.error("Library page load failed:", err);
  }

  const games = await gamesFor(
    entries.map((e) => e.gameSlug),
    { includeUnpublished: true }
  );

  const editionsByGame: Record<string, { slug: string; name: string; type?: string; isDefault?: boolean }[]> = {};
  await Promise.all(
    games.map(async (game) => {
      try {
        const eds = await listPublicEditionsForGame(game);
        editionsByGame[game.slug] = eds.map((e) => ({
          slug: e.slug,
          name: e.name,
          type: e.type,
          isDefault: Boolean(e.isDefault),
        }));
      } catch {
        editionsByGame[game.slug] = [];
      }
    })
  );

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

  const canSeeTesting = canAccessTesting(session?.user);
  const allGames = await listGames({ includeTesting: canSeeTesting });
  const installableGames = allGames
    .filter(isLauncherInstallable)
    .map((g) => ({ slug: g.slug, title: g.title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        </div>
        {isLibraryPlatform(viewerPlatform) ? (
          <AddGameButton games={installableGames} />
        ) : (
          <Link
            href="/discover"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            <Plus className="mr-2 size-4" />
            Add Game
          </Link>
        )}
      </div>

      {hiddenElsewhereCount > 0 && (
        <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {hiddenElsewhereCount} more game{hiddenElsewhereCount === 1 ? "" : "s"} only on other
          devices and not available on this one — open PlayBound there to play them.
        </p>
      )}

      {!hasAny ? (
        <div className="space-y-4">
          <EmptyHint icon={LibraryBig}>
            {hiddenElsewhereCount > 0
              ? `Nothing playable on ${LIBRARY_PLATFORM_LABELS[viewerPlatform]} yet — your ${hiddenElsewhereCount} game${hiddenElsewhereCount === 1 ? "" : "s"} stay on another device.`
              : "Your library is empty. Install with the PlayBound app, or open a game page and add one you already own."}
          </EmptyHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/discover"
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Browse Discover
            </Link>
            {offerLauncherDownload ? (
              <a
                href={downloadUrl}
                className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
              >
                Download the Launcher
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <LibraryGrid
          games={games}
          entries={entries}
          orphans={orphanEntries}
          modsByBase={modsByBase}
          editionsByGame={editionsByGame}
        />
      )}
    </div>
  );
}
