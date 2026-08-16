"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import type { CatalogLiveStats, CatalogPopularGame } from "@/lib/liveActivity";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  filterGamesForPreference,
  type GameLike,
} from "@/lib/compatibility/compatibility";
import { Avatar } from "@/components/ui/bits";

export type TopPlayer = {
  id: string;
  username: string;
  image?: string;
  durationMs?: number;
};

function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 17) % 360;
  return h;
}

export type ActivityStatsRow = {
  label: string;
  value: string | number;
};

/** Right-column activity card. Numbers come from the shared 15-minute snapshot. */
export function ActivityStatsCard({
  title = "Activity",
  playingNow,
  rows,
  topPlayers,
}: {
  title?: string;
  playingNow: number;
  rows: ActivityStatsRow[];
  topPlayers?: TopPlayer[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <Users className="size-4 text-primary" />
        <p className="text-2xl font-extrabold tracking-tight">{playingNow.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">playing now</p>
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 space-y-2.5 border-t border-border pt-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {topPlayers && topPlayers.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-2">
            Top Players
          </p>
          <ul className="space-y-2">
            {topPlayers.map((player) => (
              <li key={player.id} className="flex items-center gap-2">
                <Avatar name={player.username} hue={hueFromName(player.username)} size="sm" />
                <Link
                  href={`/users/${player.username}`}
                  className="text-sm font-medium hover:text-primary hover:underline truncate"
                >
                  {player.username}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Updated every 15 minutes</p>
    </div>
  );
}

const PODIUM_MEDALS = ["🥇", "🥈", "🥉"] as const;

export type CatalogStatsGame = GameLike & { slug: string };
export type CatalogStatsMod = { baseGameSlug: string };

/** Homepage header catalog snapshot. Respects Compatible / All Games. */
export function CatalogStatsCard({
  live,
  games,
  mods,
}: {
  live: CatalogLiveStats;
  games: CatalogStatsGame[];
  mods: CatalogStatsMod[];
}) {
  const { mode, device } = useCompatibilityFilter();
  const compatibleOnly = mode === "compatible";

  const byGame = Array.isArray(live.byGame) ? live.byGame : live.mostPopular;
  const editionCountBySlug = live.editionCountBySlug ?? {};

  let gameCount = live.gameCount;
  let modCount = live.modCount;
  let editionCount = live.editionCount;
  let playingNow = live.playingNow;
  let mostPopular: CatalogPopularGame[] = live.mostPopular;
  let footer = "Across supported games • Updated every 15 min";

  if (compatibleOnly) {
    const compatibleGames = filterGamesForPreference(games, "compatible", device.type);
    const compatibleSlugs = new Set(compatibleGames.map((g) => g.slug));

    gameCount = compatibleGames.length;
    modCount = mods.filter((m) => compatibleSlugs.has(m.baseGameSlug)).length;
    editionCount = [...compatibleSlugs].reduce(
      (sum, slug) => sum + Math.max(1, Number(editionCountBySlug[slug]) || 0),
      0
    );
    playingNow = byGame
      .filter((g) => compatibleSlugs.has(g.slug))
      .reduce((sum, g) => sum + (Number(g.playingNow) || 0), 0);
    mostPopular = byGame
      .filter((g) => compatibleSlugs.has(g.slug))
      .slice()
      .sort((a, b) => b.playingNow - a.playingNow || a.title.localeCompare(b.title))
      .slice(0, 3);
    footer = "Compatible with this device • Updated every 15 min";
  }

  const items = [
    { label: "Games", value: gameCount },
    { label: "Mods", value: modCount },
    { label: "Editions", value: editionCount },
    { label: "Gamers Playing", value: playingNow },
  ];

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 sm:max-w-sm lg:w-80">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-lg font-extrabold tabular-nums tracking-tight">
              {item.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      {mostPopular.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="text-xs font-semibold">Most Popular Right Now</p>
          <ol className="mt-1.5 space-y-1">
            {mostPopular.map((game, i) => (
              <li key={game.slug} className="text-sm leading-snug">
                <span className="mr-1.5" aria-hidden>
                  {PODIUM_MEDALS[i] ?? `${i + 1}.`}
                </span>
                <Link
                  href={`/games/${game.slug}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {game.title}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-2.5 text-[11px] text-muted-foreground">{footer}</p>
    </div>
  );
}
