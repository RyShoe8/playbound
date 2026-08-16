"use client";

import Link from "next/link";
import type { CatalogModPublic } from "@/lib/mods";
import type { GameLike } from "@/lib/compatibility/compatibility";
import { isModCompatible } from "@/lib/compatibility/compatibility";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { ModCard } from "@/components/ModCard";
import { CompatibleGamesFade } from "@/components/compatibility/useFilteredGames";

export type ModBaseGameInfo = GameLike & {
  slug: string;
  title: string;
  coverImage?: string;
};

export type ModCatalogSection = {
  gameSlug: string;
  mods: CatalogModPublic[];
};

export function ModsCatalog({
  sections,
  gamesBySlug,
}: {
  sections: ModCatalogSection[];
  gamesBySlug: Record<string, ModBaseGameInfo | undefined>;
}) {
  const { mode, device } = useCompatibilityFilter();

  const visible = sections
    .map((section) => {
      const game = gamesBySlug[section.gameSlug];
      const mods =
        mode === "all"
          ? section.mods
          : section.mods.filter((mod) => isModCompatible(mod, game, device.type));
      return { ...section, mods };
    })
    .filter((section) => section.mods.length > 0);

  const visibleModCount = visible.reduce((n, s) => n + s.mods.length, 0);
  const animKey = `${mode}|${visible.map((s) => s.gameSlug).join(",")}`;

  return (
    <div className="mt-8 space-y-8">
      <p className="text-sm text-muted-foreground">
        Showing {visibleModCount} mod{visibleModCount === 1 ? "" : "s"}
        {mode === "compatible" ? " for games compatible with this device" : ""}.
      </p>

      {visible.length === 0 ? (
        <p className="py-8 text-muted-foreground">
          No mods for compatible games right now. Switch to All Games to browse the full mods
          catalog.
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey} className="space-y-10">
          {visible.map((section) => {
            const game = gamesBySlug[section.gameSlug];
            return (
              <section key={section.gameSlug}>
                <h2 className="text-xl font-bold">
                  {game ? (
                    <Link href={`/games/${game.slug}`} className="hover:text-primary">
                      {game.title}
                    </Link>
                  ) : (
                    section.gameSlug
                  )}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {section.mods.length} mod{section.mods.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
                  {section.mods.map((mod) => (
                    <li key={mod.slug}>
                      <ModCard
                        mod={mod}
                        baseGame={
                          game
                            ? {
                                slug: game.slug,
                                title: game.title,
                                coverImage: game.coverImage,
                              }
                            : null
                        }
                        meta={[
                          game?.title ? `For ${game.title}` : (mod.baseGameSlug ? `For ${mod.baseGameSlug}` : null),
                          mod.license, 
                          mod.sizeMB ? `~${mod.sizeMB} MB` : null
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CompatibleGamesFade>
      )}
    </div>
  );
}
