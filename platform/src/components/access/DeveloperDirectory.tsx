"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/bits";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterBySlugAccess } from "@/lib/access/discoveryMode";

export type DirectoryDeveloper = {
  slug: string;
  name: string;
  tagline: string;
  founded: number;
  artHue: number;
  /** Every published game by this developer, before the viewer's mode. */
  gameSlugs: string[];
};

/**
 * The developer directory, narrowed in the browser rather than on the server.
 *
 * This list is doubly mode-dependent: FREE mode changes each developer's game
 * count *and* drops any developer left with none. Doing that server-side meant
 * reading a cookie, which opts the route out of prerendering entirely — so the
 * page was rendered from scratch for every visitor to produce output that is
 * identical for everyone who has not touched the toggle, which is every
 * crawler and every first-time reader.
 *
 * The server now sends the canonical directory and this applies the
 * preference, using the same `filterBySlugAccess` predicate the server used
 * so there is still one definition of "visible in FREE mode".
 *
 * `gameSlugs` rather than counts: a count cannot be re-filtered, and slugs are
 * what the tier map is keyed by.
 */
export function DeveloperDirectory({ developers }: { developers: DirectoryDeveloper[] }) {
  const { mode } = useDiscoveryMode();
  const tiers = useAccessTiers();

  const visible = developers
    .map((dev) => ({
      dev,
      count:
        mode === "FREE"
          ? filterBySlugAccess(dev.gameSlugs, "FREE", tiers, (s) => s).length
          : dev.gameSlugs.length,
    }))
    // Same gate the server used: a developer with nothing to show is an empty
    // profile page, so it stays out of the directory.
    .filter(({ count }) => count > 0);

  if (visible.length === 0) {
    return (
      <p className="mt-10 text-sm text-muted-foreground">
        No teams to show in Free mode — switch to All Games to see everyone.
      </p>
    );
  }

  return (
    <ul className="mt-10 grid gap-3 sm:grid-cols-2">
      {visible.map(({ dev, count }) => (
        <li key={dev.slug}>
          <Link
            href={`/developers/${dev.slug}`}
            className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Avatar name={dev.name} hue={dev.artHue} size="lg" />
            <div className="min-w-0">
              <p className="font-bold">{dev.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{dev.tagline}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {count} {count === 1 ? "game" : "games"} · since {dev.founded}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
