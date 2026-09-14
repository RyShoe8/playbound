import Link from "next/link";
import { Compass, Unlock } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameCard, PlayCta } from "@/components/GameCard";
import { GetGameCta, type StoreAffiliateMap } from "@/components/GameCommerce";
import { EditionCard } from "@/components/editions/EditionCard";
import { ModCard } from "@/components/ModCard";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { EmptyHint } from "@/components/ui/bits";
import { directPurchaseRequired } from "@/lib/access/resolver";
import { masterCopyUnlocksEmpty, type MasterCopyUnlocks as Unlocks } from "@/lib/masterCopy";

export function MasterCopyUnlocks({
  game,
  unlocks,
  affiliates,
}: {
  game: Game;
  unlocks: Unlocks;
  affiliates?: StoreAffiliateMap;
}) {
  const empty = masterCopyUnlocksEmpty(unlocks);
  const baseBySlug = new Map<string, Game>(unlocks.games.map((g) => [g.slug, g]));
  for (const g of unlocks.standaloneGames ?? []) {
    baseBySlug.set(g.slug, g);
  }
  baseBySlug.set(game.slug, game);

  const titleCount = unlocks.games.length;
  const hasUnlocks =
    unlocks.games.length > 0 || unlocks.editions.length > 0 || unlocks.mods.length > 0;
  const standaloneGames = unlocks.standaloneGames ?? [];
  const standaloneEditions = unlocks.standaloneEditions ?? [];
  const hasStandalones = standaloneGames.length > 0 || standaloneEditions.length > 0;
  const standaloneCount = standaloneGames.length + standaloneEditions.length;

  if (empty) {
    return (
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-bold">What this copy unlocks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Owning {game.title} unlocks the games, editions, and mods below.
          </p>
        </div>
        <EmptyHint icon={Unlock}>
          Nothing is wired to this copy yet. Games that require it — and their editions and mods —
          will show up here.
        </EmptyHint>
      </section>
    );
  }

  return (
    <div className="space-y-12">
      {/* ── Genuine unlocks (requires base game) ── */}
      {hasUnlocks ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-bold">
              What this copy unlocks{titleCount > 0 ? ` (${titleCount})` : ""}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Owning {game.title} unlocks the games, editions, and mods below.
            </p>
          </div>

          <div className="space-y-10">
            {titleCount > 0 ? (
              <div className="flex flex-wrap gap-4">
                {unlocks.games.map((unlocked) => {
                  const paid = directPurchaseRequired(unlocked.access);
                  return (
                    <div
                      key={unlocked.slug}
                      className="flex w-[250px] shrink-0 flex-col gap-3 self-start sm:w-[276px]"
                    >
                      <GameCard game={unlocked} className="h-auto" />
                      <div className="flex flex-wrap gap-2">
                        <GetGameCta game={unlocked} size="sm" affiliates={affiliates} />
                        {paid ? null : <PlayCta game={unlocked} size="sm" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {unlocks.editions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {unlocks.editions.map(({ game: parent, edition }) => (
                  <EditionCard
                    key={`${parent.slug}:${edition.id}`}
                    game={parent}
                    edition={edition}
                  />
                ))}
              </div>
            ) : null}

            {unlocks.mods.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-base font-bold">Mods ({unlocks.mods.length})</h3>
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
        </section>
      ) : null}

      {/* ── Standalones from this series (does not require base game) ── */}
      {hasStandalones ? (
        <section className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="size-5 text-primary" />
              <h2 className="text-lg font-bold">
                Standalone games from this series
                {standaloneCount > 0 ? ` (${standaloneCount})` : ""}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              These standalone releases are set in the same universe but run independently — no purchase or base game required.
            </p>
          </div>

          <div className="space-y-8">
            {standaloneGames.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {standaloneGames.map((sg) => {
                  const paid = directPurchaseRequired(sg.access);
                  return (
                    <div
                      key={sg.slug}
                      className="flex w-[250px] shrink-0 flex-col gap-3 self-start sm:w-[276px]"
                    >
                      <GameCard game={sg} className="h-auto" />
                      <div className="flex flex-wrap gap-2">
                        <GetGameCta game={sg} size="sm" affiliates={affiliates} />
                        {paid ? null : <PlayCta game={sg} size="sm" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {standaloneEditions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {standaloneEditions.map(({ game: parent, edition }) => (
                  <EditionCard
                    key={`${parent.slug}:${edition.id}`}
                    game={parent}
                    edition={edition}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
