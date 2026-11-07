"use client";

import Link from "next/link";
import type { EditionSearchHit } from "@/lib/catalog";
import { GameArt } from "@/components/GameArt";
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
      <div className="search-card-grid">
        {visible.map(({ edition, game }) => (
          <Link
            key={edition.id}
            href={`/games/${game.slug}/editions/${edition.slug}`}
            className="new-game-card flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
          >
            <div className="new-card-art relative w-full shrink-0 overflow-hidden">
              {/* The edition's own art when it has some, otherwise its game's. */}
              <GameArt
                game={{ ...game, title: edition.name, coverImage: edition.branding?.heroImage || edition.branding?.screenshots?.[0] || game.coverImage }}
                className="size-full"
                showTitle={false}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 border-t border-border/70 bg-card/90 px-2.5 py-2">
              <h3 className="new-card-title">{edition.name}</h3>
              <p className="truncate text-xs font-semibold text-muted-foreground">{game.title}</p>
              {edition.shortDescription && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{edition.shortDescription}</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <EditionTypeBadge edition={edition} />
                <VerificationBadge level={edition.verificationLevel} showLabel={false} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
