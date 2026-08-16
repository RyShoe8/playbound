"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Gamepad2, LogIn, Users } from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { CreatePartyPanel } from "@/components/friends/CreatePartyPanel";

type LookingPlayer = {
  id: string;
  username: string;
  wantsToPlay: { slug: string; title: string }[];
  installedGames: { slug: string; title: string }[];
  currentGame: { slug: string; title: string } | null;
};

function GameChips({
  games,
  emptyLabel,
  tone = "muted",
}: {
  games: { slug: string; title: string }[];
  emptyLabel: string;
  tone?: "muted" | "primary";
}) {
  if (games.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const shown = games.slice(0, 8);
  const extra = games.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((game) => (
        <Link
          key={game.slug}
          href={`/games/${encodeURIComponent(game.slug)}`}
          className={
            tone === "primary"
              ? "rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/25"
              : "rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
          }
        >
          {game.title}
        </Link>
      ))}
      {extra > 0 ? (
        <span className="rounded-full bg-secondary/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          +{extra} more
        </span>
      ) : null}
    </div>
  );
}

export function LookingToPartyView() {
  const { status } = useSession();
  const [players, setPlayers] = useState<LookingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/presence/lfg/list")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data?.players)) setPlayers(data.players);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    // The flag has an hour's TTL and people come and go, so keep it fresh at
    // the same cadence the friends page polls presence.
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status]);

  if (status === "loading") {
    return <div className="animate-pulse text-muted-foreground">Loading…</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Looking to Party</h1>
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sign in to see who wants a game right now.
          </p>
          <Link
            href="/login?callbackUrl=/looking-to-party"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <LogIn className="size-4" />
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Looking to Party</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Players who want a game right now, and what they already have installed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            {createOpen ? "Close" : "Start Party"}
          </button>
          <Link
            href="/friends"
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80"
          >
            Friends
          </Link>
        </div>
      </div>

      {createOpen ? <CreatePartyPanel onCreated={() => setCreateOpen(false)} /> : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nobody is looking to party at the moment. Raise your hand on the Friends page and
            you&apos;ll show up here for the next hour.
          </p>
          <Link
            href="/friends"
            className="mt-3 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            Look for a Party
          </Link>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Users className="size-4 text-primary" />
            {players.length} looking
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={player.username} hue={265} size="lg" />
                  <div className="min-w-0">
                    <Link
                      href={`/users/${encodeURIComponent(player.username)}`}
                      className="text-lg font-extrabold tracking-tight hover:underline"
                    >
                      {player.username}
                    </Link>
                    {player.currentGame ? (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-primary">
                        <Gamepad2 className="size-3.5" />
                        Playing {player.currentGame.title}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-muted-foreground">Free to play now</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Wants to play
                  </p>
                  <GameChips
                    games={player.wantsToPlay}
                    emptyLabel="Up for anything"
                    tone="primary"
                  />
                </div>

                <div className="mt-auto space-y-1.5">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Installed
                  </p>
                  <GameChips games={player.installedGames} emptyLabel="No installs yet" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
