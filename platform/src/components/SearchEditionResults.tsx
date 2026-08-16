"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import type { EditionSearchHit } from "@/lib/catalog";
import { SectionHeader } from "@/components/ui/bits";
import { EditionTypeBadge, VerificationBadge } from "@/components/editions/EditionBadges";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isEditionCompatible } from "@/lib/compatibility/compatibility";

export function SearchEditionResults({ hits }: { hits: EditionSearchHit[] }) {
  const { mode, device } = useCompatibilityFilter();

  const visible = hits
    .filter((hit) =>
      mode === "compatible" ? isEditionCompatible(hit.edition, hit.game, device.type) : true
    )
    .slice()
    .sort((a, b) => {
      const ac = isEditionCompatible(a.edition, a.game, device.type) ? 0 : 1;
      const bc = isEditionCompatible(b.edition, b.game, device.type) ? 0 : 1;
      return ac - bc;
    });

  if (visible.length === 0) return null;

  return (
    <section>
      <SectionHeader title={`Editions (${visible.length})`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map(({ edition, game }) => (
          <Link
            key={edition.id}
            href={`/games/${game.slug}/editions/${edition.slug}`}
            className="min-w-0 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <p className="truncate text-xs font-semibold text-muted-foreground">{game.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-bold">
              <Layers className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{edition.name}</span>
            </p>
            {edition.shortDescription && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {edition.shortDescription}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EditionTypeBadge edition={edition} />
              <VerificationBadge level={edition.verificationLevel} showLabel={false} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
