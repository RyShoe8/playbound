"use client";

import Link from "next/link";
import { Server, Users, ArrowRight, Bot } from "lucide-react";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { SectionHeader } from "@/components/ui/bits";

export type HomeCommunityServer = {
  id: string;
  gameSlug: string;
  gameTitle: string;
  editionSlug?: string | null;
  serverName: string;
  host: string;
  port: number;
  players: number | null;
  maxPlayers: number | null;
  bots?: number | null;
  region: string;
  platforms?: string[];
  browserPlayable?: boolean;
  steamDeck?: boolean;
};

export function HomeCommunityServers({ servers }: { servers: HomeCommunityServer[] }) {
  const { mode, device } = useCompatibilityFilter();
  const visible =
    mode === "all"
      ? servers
      : servers.filter((s) => !s.platforms || isGameCompatible(s, device.type));

  return (
    <section>
      <SectionHeader
        title="Community Servers"
        subtitle="Dedicated servers hosted by PlayBound — join and play right now"
        href="/multiplayer"
      />
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-6 text-center">
          <p className="text-sm font-semibold text-muted-foreground">
            No community servers currently active for this platform.
          </p>
          <Link
            href="/multiplayer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            Browse all multiplayer servers <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {visible.map((server) => {
            const addr = `${server.host}:${server.port}`;
            return (
              <Link
                key={server.id || addr}
                href={`/multiplayer?game=${encodeURIComponent(server.gameSlug)}`}
                className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 font-extrabold text-foreground">
                      <Server className="size-3.5 text-primary" /> {server.gameTitle}
                    </span>
                    <span className="font-semibold text-foreground/90">{server.serverName}</span>
                    <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary">
                      PlayBound Hosted
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    {server.editionSlug && <span>Edition: {server.editionSlug}</span>}
                    <span className="font-mono text-muted-foreground/80">{addr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Users className="size-3.5 text-primary" />
                    {server.players == null ? "—" : `${server.players}/${server.maxPlayers ?? "—"}`}
                  </span>
                  {server.bots ? (
                    <span className="inline-flex items-center gap-1 rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Bot className="size-3 text-cyan-400" />
                      {server.bots} bot{server.bots === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <span className="uppercase tracking-wider text-muted-foreground/70">
                    {server.region}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
