"use client";

import Link from "next/link";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterCollectionsByMode } from "@/lib/access/discoveryMode";

export type DirectoryCollection = {
  slug: string;
  title: string;
  description: string;
  /** Every game in the collection, before the viewer's mode. */
  gameSlugs: string[];
};

/**
 * The collections index, narrowed in the browser rather than on the server.
 *
 * FREE mode changes three things here at once: which games count toward each
 * collection, the "N games" figure, and whether a collection appears at all —
 * filterCollectionsByMode drops any left with nothing in it. Doing that on the
 * server meant reading a cookie, and that read opted the whole route out of
 * prerendering, so the page was rebuilt for every visitor to produce output
 * identical for everyone who has not touched the toggle.
 *
 * It reuses filterCollectionsByMode rather than reimplementing the rule, so
 * the index cannot drift from what the collection pages themselves do.
 *
 * `titleBySlug` covers only the games these collections reference, so the
 * "Includes" line can be rebuilt from whatever survives the filter without
 * shipping the catalog to the browser.
 */
export function CollectionDirectory({
  collections,
  titleBySlug,
}: {
  collections: DirectoryCollection[];
  titleBySlug: Record<string, string>;
}) {
  const { mode } = useDiscoveryMode();
  const tiers = useAccessTiers();
  const visible = filterCollectionsByMode(collections, mode, tiers);

  if (visible.length === 0) {
    return (
      <p className="mt-10 text-sm text-muted-foreground">
        No collections to show in Free mode — switch to All Games to see them all.
      </p>
    );
  }

  return (
    <ul className="mt-10 grid gap-4">
      {visible.map((collection) => {
        const titles = collection.gameSlugs
          .map((s) => titleBySlug[s])
          .filter(Boolean)
          .slice(0, 5);
        return (
          <li key={collection.slug}>
            <Link
              href={`/collections/${collection.slug}`}
              className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{collection.title}</h2>
                <span className="text-xs font-semibold text-muted-foreground">
                  {collection.gameSlugs.length} games
                </span>
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">{collection.description}</p>
              {titles.length > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Includes: </span>
                  {titles.join(", ")}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
