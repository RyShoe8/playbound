import Link from "next/link";
import { Unlock } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameCard, PlayCta } from "@/components/GameCard";
import { GetGameCta, type StoreAffiliateMap } from "@/components/GameCommerce";
import { EditionCard } from "@/components/editions/EditionCard";
import { ModCard } from "@/components/ModCard";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { EmptyHint } from "@/components/ui/bits";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { masterCopyUnlocksEmpty, type MasterCopyUnlocks as Unlocks } from "@/lib/masterCopy";

export function MasterCopyUnlocks({
  game,
  unlocks,
  affiliates,
}: {
  game: Game;
  unlocks: Unlocks;
  affiliates: StoreAffiliateMap;
}) {
  const empty = masterCopyUnlocksEmpty(unlocks);
  const baseBySlug = new Map<string, Game>(unlocks.games.map((g) => [g.slug, g]));
  baseBySlug.set(game.slug, game);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-lg font-bold">What this copy unlocks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owning {game.title} unlocks the games, editions, and mods below.
        </p>
      </div>

      {empty ? (
        <EmptyHint icon={Unlock}>
          Nothing is wired to this copy yet. Games that require it — and their editions and mods —
          will show up here.
        </EmptyHint>
      ) : (
        <div className="space-y-10">
          {unlocks.games.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold">Games</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {unlocks.games.map((unlocked) => (
                  <div key={unlocked.slug} className="flex flex-col gap-2">
                    <GameCard game={unlocked} className="w-full sm:w-full" />
                    <div className="flex flex-wrap gap-2">
                      <GetGameCta game={unlocked} size="sm" affiliates={affiliates} />
                      <PlayCta
                        game={unlocked}
                        size="sm"
                        emphasis={gameRequiresPurchase(unlocked.access) ? "secondary" : "primary"}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {unlocks.editions.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold">Editions</h3>
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {unlocks.editions.map(({ game: parent, edition }) => (
                  <EditionCard key={`${parent.slug}:${edition.id}`} game={parent} edition={edition} />
                ))}
              </div>
            </div>
          ) : null}

          {unlocks.mods.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold">Mods</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {unlocks.mods.map((mod) => {
                  const parent = baseBySlug.get(mod.baseGameSlug);
                  const isExternal = mod.downloadKind === "external";
                  return (
                    <ModCard
                      key={mod.slug}
                      mod={mod}
                      baseGame={
                        parent
                          ? {
                              slug: parent.slug,
                              title: parent.title,
                              coverImage: parent.coverImage,
                            }
                          : { slug: mod.baseGameSlug }
                      }
                      actions={
                        <>
                          <LauncherInstallButton
                            slug={mod.slug}
                            kind="install-mod"
                            label={isExternal ? "Open with launcher" : "Install mod"}
                            className="border-transparent bg-play px-3 py-1.5 text-xs text-play-foreground"
                          />
                          <Link
                            href={`/mods/${mod.slug}`}
                            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
                          >
                            Details
                          </Link>
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
