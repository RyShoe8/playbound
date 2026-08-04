"use client";

import Link from "next/link";
import { Server, Users } from "lucide-react";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { SectionHeader } from "@/components/ui/bits";

export type HomeServerPreview = {
  slug: string;
  title: string;
  serverCount: number;
  playerCount: number;
  platforms: string[];
  browserPlayable: boolean;
  steamDeck: boolean;
};

export function HomeServerPreviews({ rows }: { rows: HomeServerPreview[] }) {
  const { mode, device } = useCompatibilityFilter();
  const visible =
    mode === "all"
      ? rows
      : rows.filter((r) => isGameCompatible(r, device.type));

  if (!visible.length) return null;

  return (
    <section>
      <SectionHeader
        title="Live Servers"
        subtitle="Public multiplayer right now — open the full browser for every title"
        href="/servers"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {visible.map((row) => (
          <Link
            key={row.slug}
            href={`/servers?game=${encodeURIComponent(row.slug)}`}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <p className="flex items-center gap-1.5 font-bold">
              <Server className="size-3.5 text-primary" /> {row.title}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                {row.serverCount} server{row.serverCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {row.playerCount} player{row.playerCount === 1 ? "" : "s"}
              </span>
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
