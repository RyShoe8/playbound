import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Download, LibraryBig, LogIn, MonitorPlay } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { gamesFor } from "@/lib/catalog";
import { GameCard } from "@/components/GameCard";
import { ConnectLauncherPanel } from "@/components/ConnectLauncherPanel";
import { Badge, EmptyHint } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };

type Filter = "all" | "saved" | "installed";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
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
  try {
    await dbConnect();
    const rows = await LibraryEntry.find({
      userId: session.user.id,
      $or: [{ saved: true }, { installed: true }],
    })
      .sort({ updatedAt: -1 })
      .lean();
    entries = rows.map((r) => ({
      gameSlug: r.gameSlug,
      saved: Boolean(r.saved),
      installed: Boolean(r.installed),
    }));
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
  const hasAny = entries.length > 0;
  const hasInstalled = entries.some((e) => e.installed);

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
          Games you saved on PlayBound and installs synced from the launcher.
        </p>
      </div>

      <ConnectLauncherPanel />

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
            Your library is empty. Save games from any game page, or connect the launcher to sync
            installs.
          </EmptyHint>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/discover"
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Browse Discover
            </Link>
            <Link
              href="/launcher"
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              Get the Launcher
            </Link>
          </div>
        </div>
      ) : games.length === 0 ? (
        <EmptyHint icon={MonitorPlay}>
          No games match this filter.
          {!hasInstalled && filter === "installed"
            ? " Connect the launcher and install a game to see it here."
            : ""}
        </EmptyHint>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-5">
          {games.map((game) => {
            const meta = bySlug.get(game.slug);
            return (
              <div key={game.slug} className="space-y-2">
                <GameCard game={game} />
                <div className="flex flex-wrap gap-1 px-0.5">
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasAny && !hasInstalled && filter !== "installed" && (
        <p className="text-sm text-muted-foreground">
          Tip: generate a launcher token above and paste it into the PlayBound Launcher so installs
          appear here automatically.{" "}
          <Link href="/launcher" className="font-semibold text-primary hover:underline">
            Launcher page →
          </Link>
        </p>
      )}
    </div>
  );
}
