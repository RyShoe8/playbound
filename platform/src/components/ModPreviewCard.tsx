import type { CatalogModPublic } from "@/lib/mods";
import { ModCard } from "@/components/ModCard";
import { cn } from "@/lib/utils";

/** Homepage / strip variant — same banner layout as /mods and the launcher. */
export function ModPreviewCard({
  mod,
  baseGame,
  className,
}: {
  mod: CatalogModPublic;
  baseGame?: { slug?: string; title?: string; coverImage?: string | null } | null;
  className?: string;
}) {
  return (
    <ModCard
      mod={mod}
      baseGame={baseGame}
      className={cn("w-[324px] shrink-0 snap-start", className)}
    />
  );
}
