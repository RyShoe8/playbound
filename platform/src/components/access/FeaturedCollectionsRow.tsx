"use client";

import Link from "next/link";
import { Gem } from "lucide-react";
import { SectionHeader } from "@/components/ui/bits";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterCollectionsByMode } from "@/lib/access/discoveryMode";

export type FeaturedCollection = {
  slug: string;
  title: string;
  description: string;
  gameSlugs: string[];
};

/**
 * The homepage's collections row, narrowed in the browser.
 *
 * The server used to filter and then take the first three, which meant
 * resolving the viewer's discovery mode — a cookie read, and one cookie read
 * anywhere on the homepage's server graph costs the busiest page on the site
 * its prerendering.
 *
 * The slice happens here, after the filter, for the same reason it did on the
 * server: slicing first and filtering second would leave FREE viewers with
 * fewer than three cards whenever one of the top three was paid.
 */
export function FeaturedCollectionsRow({
  collections,
  limit = 3,
}: {
  collections: FeaturedCollection[];
  limit?: number;
}) {
  const { mode } = useDiscoveryMode();
  const tiers = useAccessTiers();
  const visible = filterCollectionsByMode(collections, mode, tiers).slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Curated Collections"
        subtitle="Hand-picked groupings from PlayBound"
        href="/collections"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <p className="flex items-center gap-1.5 font-bold">
              <Gem className="size-3.5 text-primary" /> {c.title}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
