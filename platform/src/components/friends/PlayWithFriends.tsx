"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Gamepad2, Users } from "lucide-react";
import { telemetry } from "@/lib/telemetry";

type PlayingFriend = {
  id: string;
  username: string;
  gameSlug: string;
  gameTitle: string | null;
  join?: { capability: string; label: string; href: string | null };
};

type SharedGame = {
  slug: string;
  title: string;
  playingNow: { id: string; username: string }[];
  lookingForPlayers: { id: string; username: string }[];
  friendsWithAccess: { id: string; username: string }[];
  join: { capability: string; label: string; href: string | null };
};

import type { PartyPayload } from "@/lib/playTogether/types";
import { PartyCard } from "./PartyCard";

/**
 * Reusable Play With Friends surface for homepage, friends page, etc.
 */
export function PlayWithFriends({
  surface = "friends",
  compact = false,
}: {
  surface?: string;
  compact?: boolean;
}) {
  const { status } = useSession();
  const [playing, setPlaying] = useState<PlayingFriend[]>([]);
  const [shared, setShared] = useState<SharedGame[]>([]);
  const [activeParties, setActiveParties] = useState<PartyPayload[]>([]);
  const [discoverableParties, setDiscoverableParties] = useState<PartyPayload[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/play-together");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPlaying(data.friendsPlaying || []);
        setShared(data.sharedGames || []);
        setActiveParties(data.activeParties || []);
        setDiscoverableParties(data.discoverableParties || []);
        setLoaded(true);
        telemetry.track("play_together_viewed", {
          count: (data.sharedGames || []).length,
          surface,
        });
        telemetry.track("friends_playing_viewed", {
          count: (data.friendsPlaying || []).length,
          surface,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, surface]);

  if (status !== "authenticated") return null;
  if (!loaded) {
    return (
      <div className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
    );
  }

  if (playing.length === 0 && shared.length === 0 && activeParties.length === 0 && discoverableParties.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card/40 p-4">
        <h2 className="text-lg font-bold">Play With Friends</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No friends are playing right now. See what they&apos;ve been into on{" "}
          <Link href="/friends" className="font-semibold text-primary hover:underline">
            Friends
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {compact ? "Your Friends Are Playing" : "Play With Friends"}
          </h2>
          {!compact && playing.length > 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              <Users className="mr-1 inline size-3.5" />
              {playing.length} PlayBound friend{playing.length === 1 ? "" : "s"} playing now
            </p>
          ) : null}
        </div>
        {compact ? (
          <Link href="/friends" className="text-sm font-semibold text-primary hover:underline">
            See all
          </Link>
        ) : null}
      </div>

      {activeParties.length > 0 && (
        <div className="space-y-2">
          {/*
            Labelled. These are the viewer's own parties, and they were being
            rendered directly beneath "Your Friends Are Playing" with no heading
            of their own — so your own party read as a friend's. The two lists
            below already say what they are; this one did not.
          */}
          <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            {activeParties.length === 1 ? "Your Party" : "Your Parties"}
          </h3>
          {activeParties.map((p) => (
            <PartyCard key={p.id} party={p} />
          ))}
        </div>
      )}

      {discoverableParties.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
            You Could Play Together
          </h3>
          {discoverableParties.map((p) => (
            <PartyCard key={p.id} party={p} />
          ))}
        </div>
      )}

      {playing.length > 0 && (
        <div className="space-y-2">
          {(compact ? playing.slice(0, 4) : playing).map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  <Gamepad2 className="mr-1 inline size-3.5 text-violet-500" />
                  {f.username}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.gameTitle || f.gameSlug} · Playing now
                </p>
              </div>
              {f.join?.href && f.join.capability !== "unsupported" ? (
                <Link
                  href={f.join.href}
                  className="rounded-full bg-play px-3 py-1.5 text-xs font-bold text-play-foreground hover:brightness-110"
                  onClick={() =>
                    telemetry.track("join_game_clicked", {
                      friendId: f.id,
                      gameSlug: f.gameSlug,
                      capability: f.join?.capability,
                      surface,
                    })
                  }
                >
                  {f.join.label || "Join Game"}
                </Link>
              ) : (
                <Link
                  href={`/games/${encodeURIComponent(f.gameSlug)}`}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
                >
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {!compact && shared.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
            Games you can play together
          </h3>
          {shared.slice(0, 6).map((g) => {
            const lead =
              g.playingNow[0]?.username ||
              g.lookingForPlayers[0]?.username ||
              g.friendsWithAccess[0]?.username;
            const statusLine = g.playingNow.length
              ? `${g.playingNow[0].username} is playing`
              : g.lookingForPlayers.length
                ? `${g.lookingForPlayers[0].username} is looking for players`
                : `${g.friendsWithAccess.length} friend${g.friendsWithAccess.length === 1 ? "" : "s"} have access`;
            return (
              <div
                key={g.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{g.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    You have access
                    {lead ? ` · ${statusLine}` : ""}
                  </p>
                </div>
                <Link
                  href={g.join.href || `/games/${encodeURIComponent(g.slug)}`}
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110"
                  onClick={() =>
                    telemetry.track("shared_game_clicked", { gameSlug: g.slug, surface })
                  }
                >
                  Play
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
