"use client";

import Link from "next/link";
import { Users, Server, Radio, Sparkles, Gamepad2, ArrowRight } from "lucide-react";
import { CoverImage } from "@/components/CoverImage";
import type { GameMultiplayerActivity } from "@/app/api/multiplayer/activity/route";
import { cn } from "@/lib/utils";

type Props = {
  activity: GameMultiplayerActivity;
  onSelectGameForLtp?: (gameSlug: string) => void;
  onBrowseServers?: (gameSlug: string) => void;
  onStartParty?: (gameSlug: string) => void;
};

export function MultiplayerGameCard({
  activity,
  onSelectGameForLtp,
  onBrowseServers,
  onStartParty,
}: Props) {
  const hasActiveCoordination = activity.openPartyCount > 0 || activity.usersLookingCount > 0;
  const hasLiveServers = activity.serverPlayerCount > 0 || activity.serversOnline > 0;

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4 transition-all duration-300 hover:border-primary/50 hover:bg-card/90 hover:shadow-xl hover:shadow-primary/5">
      {/* Top Banner / Art */}
      <div className="relative mb-3 flex items-start gap-3.5">
        <div className="relative aspect-[3/4] w-20 flex-shrink-0 overflow-hidden rounded-xl bg-secondary/80 border border-border/50">
          {activity.coverImage ? (
            <CoverImage
              src={activity.coverImage}
              alt={activity.gameTitle}
              sizes="80px"
              className="transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Gamepad2 className="size-6 opacity-60" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {activity.isMmo && (
              <span className="rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-300 border border-purple-500/30">
                MMO World
              </span>
            )}
            {activity.isFree ? (
              <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 border border-emerald-500/30">
                Free
              </span>
            ) : (
              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                Value
              </span>
            )}
            {activity.openPartyCount > 0 && (
              <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary border border-primary/40 animate-pulse">
                Active Party
              </span>
            )}
          </div>

          <Link
            href={`/games/${encodeURIComponent(activity.gameSlug)}`}
            className="mt-1 block font-bold text-foreground transition-colors hover:text-primary group-hover:underline text-base leading-tight line-clamp-2"
          >
            {activity.gameTitle}
          </Link>

          {activity.genre && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{activity.genre}</p>
          )}
        </div>
      </div>

      {/* Real-time Activity Metrics (explicitly labeled to never misrepresent external server population) */}
      <div className="my-2 space-y-1.5 rounded-xl border border-border/50 bg-secondary/30 p-2.5 text-xs">
        {/* Tracked Server Population */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Server className="size-3.5 text-cyan-400" />
            <span>{activity.isMmo ? "Live ecosystem" : "Tracked servers"}</span>
          </span>
          <span className={cn("font-bold", activity.serverPlayerCount > 0 ? "text-foreground" : "text-muted-foreground/70")}>
            {activity.serverPlayerCount > 0
              ? `${activity.serverPlayerCount.toLocaleString()} server player${activity.serverPlayerCount === 1 ? "" : "s"}`
              : activity.serversOnline > 0
              ? `${activity.serversOnline} online (idle)`
              : "No servers"}
          </span>
        </div>

        {/* PlayBound Looking to Party */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Radio className="size-3.5 text-amber-400" />
            <span>Looking to party</span>
          </span>
          <span className={cn("font-bold", activity.usersLookingCount > 0 ? "text-amber-400" : "text-muted-foreground/70")}>
            {activity.usersLookingCount > 0
              ? `${activity.usersLookingCount} user${activity.usersLookingCount === 1 ? "" : "s"}`
              : "0 users"}
          </span>
        </div>

        {/* PlayBound Open Parties */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-3.5 text-primary" />
            <span>Open parties</span>
          </span>
          <span className={cn("font-bold", activity.openPartyCount > 0 ? "text-primary" : "text-muted-foreground/70")}>
            {activity.openPartyCount > 0
              ? `${activity.openPartyCount} part${activity.openPartyCount === 1 ? "y" : "ies"}`
              : "0 parties"}
          </span>
        </div>
      </div>

      {/* Action CTAs */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-1">
        {activity.supportsParty && onStartParty && (
          <button
            type="button"
            onClick={() => onStartParty(activity.gameSlug)}
            className="flex-1 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:brightness-110"
          >
            Start Party
          </button>
        )}

        {onSelectGameForLtp && (
          <button
            type="button"
            onClick={() => onSelectGameForLtp(activity.gameSlug)}
            className="flex-1 rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors"
          >
            Find Players
          </button>
        )}

        {activity.supportsDirectJoin && onBrowseServers && (
          <button
            type="button"
            onClick={() => onBrowseServers(activity.gameSlug)}
            className="rounded-xl border border-border bg-secondary/80 hover:bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            title="Browse live servers for this game"
          >
            Servers
          </button>
        )}
      </div>
    </div>
  );
}
