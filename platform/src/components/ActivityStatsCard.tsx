"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { CatalogLiveStats } from "@/lib/liveActivity";
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

/** Homepage header catalog snapshot. Same 15-minute numbers for every visitor. */
export function CatalogStatsCard({
  live,
  openPartyCount = 0,
}: {
  live: CatalogLiveStats;
  openPartyCount?: number;
}) {
  /*
   * Fetched on the client rather than rendered with the page.
   *
   * The homepage is served from the CDN, so a count computed during render is
   * frozen — create a public party, load the homepage, and it still reads 0
   * until something revalidates. Partial Prerendering is not enabled, so a
   * request-time hole would force the entire route dynamic and cost the page
   * its cache. Fetching here keeps the page cached and the number live.
   *
   * Starts from the server-rendered value so there is no flash of 0, and a
   * failed fetch simply leaves it in place.
   */
  const [parties, setParties] = useState(openPartyCount);
  const [looking, setLooking] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parties/open-count")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.count === "number") setParties(data.count);
      })
      .catch(() => {
        /* keep whatever the page rendered */
      });
    // Same client-fetch reasoning as the party count above.
    fetch("/api/presence/lfg/count")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.count === "number") setLooking(data.count);
      })
      .catch(() => {
        /* leave at 0 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mostPopular = Array.isArray(live.mostPopular) ? live.mostPopular : [];
  const items = [
    { label: "Games", value: live.gameCount, href: "/discover" },
    { label: "Mods", value: live.modCount, href: "/mods" },
    { label: "Editions", value: live.editionCount, href: null },
    { label: "Gamers Playing", value: live.playingNow, href: null },
    { label: "Open Parties", value: parties, href: "/events" },
    { label: "Looking to Party", value: looking, href: "/looking-to-party" },
  ];

  return (
    <div className="flex h-full min-h-[320px] w-full flex-col rounded-xl border border-border bg-card p-4 sm:max-w-sm lg:w-80">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {items.map((item) => {
          const value = (
            <dd className="text-lg font-extrabold tabular-nums tracking-tight">
              {item.value.toLocaleString()}
            </dd>
          );
          return (
            <div key={item.label}>
              {item.href ? (
                <Link href={item.href} className="group block rounded-md outline-none hover:text-primary">
                  <dt className="text-xs text-muted-foreground group-hover:text-primary">{item.label}</dt>
                  {value}
                </Link>
              ) : (
                <>
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  {value}
                </>
              )}
            </div>
          );
        })}
      </dl>

      {mostPopular.length > 0 && (
        <div className="mt-3 flex-1 border-t border-border pt-2.5">
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

      <p className="mt-auto pt-2.5 text-[11px] text-muted-foreground">
        Across supported games • Updated every 15 min
      </p>
    </div>
  );
}
