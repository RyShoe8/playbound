"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Swords, Users, Server, Radio, ArrowRight, Plus } from "lucide-react";
import type { GameMultiplayerActivity } from "@/app/api/multiplayer/activity/route";

type Props = {
  gameSlug: string;
  gameTitle: string;
};

export function GameMultiplayerSection({ gameSlug, gameTitle }: Props) {
  const [activity, setActivity] = useState<GameMultiplayerActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadActivity() {
      try {
        const res = await fetch(`/api/multiplayer/activity?slug=${encodeURIComponent(gameSlug)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.activity) {
          setActivity(data.activity);
        }
      } catch (err) {
        console.error("Failed to load game multiplayer activity:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadActivity();
    return () => {
      mounted = false;
    };
  }, [gameSlug]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-secondary/20 p-5 animate-pulse">
        <div className="h-4 w-32 rounded bg-secondary/60" />
      </div>
    );
  }

  if (!activity) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-secondary/30 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
          <Swords className="size-4" />
          <span>Multiplayer Activity</span>
        </div>
        <Link
          href={`/multiplayer?game=${encodeURIComponent(gameSlug)}`}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          Multiplayer Hub
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tracked Server Players */}
        <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server className="size-3.5 text-cyan-400" />
            <span>{activity.isMmo ? "Live Ecosystem" : "Tracked Servers"}</span>
          </div>
          <div className="mt-1 text-lg font-bold text-foreground">
            {activity.serverPlayerCount > 0
              ? `${activity.serverPlayerCount.toLocaleString()} server players`
              : activity.serversOnline > 0
              ? `${activity.serversOnline} servers online`
              : "No live servers"}
          </div>
        </div>

        {/* Looking to Party */}
        <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3.5 text-amber-400" />
            <span>Looking to Party</span>
          </div>
          <div className="mt-1 text-lg font-bold text-amber-400">
            {activity.usersLookingCount > 0
              ? `${activity.usersLookingCount} user${activity.usersLookingCount === 1 ? "" : "s"} searching`
              : "0 searching"}
          </div>
        </div>

        {/* Open Parties */}
        <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5 text-primary" />
            <span>Open Parties</span>
          </div>
          <div className="mt-1 text-lg font-bold text-primary">
            {activity.openPartyCount > 0
              ? `${activity.openPartyCount} active part${activity.openPartyCount === 1 ? "y" : "ies"}`
              : "0 open parties"}
          </div>
        </div>
      </div>

      {/* Action CTAs */}
      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap items-center gap-2.5">
        <Link
          href={`/multiplayer?game=${encodeURIComponent(gameSlug)}`}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110"
        >
          Start or Join Party
        </Link>
        {activity.supportsDirectJoin && (
          <Link
            href={`/multiplayer?game=${encodeURIComponent(gameSlug)}`}
            className="rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-4 py-2 text-xs font-bold text-foreground"
          >
            Browse Servers
          </Link>
        )}
      </div>
    </div>
  );
}
