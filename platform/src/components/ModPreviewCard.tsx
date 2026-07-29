import Link from "next/link";
import type { CatalogModPublic } from "@/lib/mods";
import { cn } from "@/lib/utils";

/** Compact mod card for homepage / browse strips. */
export function ModPreviewCard({
  mod,
  className,
}: {
  mod: CatalogModPublic;
  className?: string;
}) {
  return (
    <Link
      href={`/mods/${mod.slug}`}
      className={cn(
        "group flex w-56 shrink-0 snap-start flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40",
        className
      )}
    >
      <p className="truncate font-bold group-hover:text-primary">{mod.title}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mod.tagline}</p>
      <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
        For {mod.baseGameSlug}
        {mod.sizeMB ? ` · ~${mod.sizeMB} MB` : ""}
      </p>
    </Link>
  );
}
