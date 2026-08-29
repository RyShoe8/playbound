import { describe, it, expect } from "vitest";
import { toJoinCatalogGame } from "@/lib/catalog";
import { games as seedGames } from "@/lib/data/games";
import { resolveJoinCapability } from "@/lib/playTogether/joinCapability";
import { supportsMultiplayer } from "@/lib/multiplayer/support";

/**
 * The friends/party path reads a projected catalog, not full game objects.
 *
 * `listGamesForJoin` exists because `unstable_cache` JSON.parses its stored
 * value on every hit, so serving 607 KB of descriptions, media and install
 * recipes to answer "is this multiplayer, and what is it called" was ~1.9ms of
 * pure deserialization on an endpoint a party polls every 3 seconds.
 *
 * The hazard is that the projection is a hand-written field list feeding
 * functions that read fields dynamically — `supportsMultiplayer` reaches for
 * `multiplayer` and `isMultiplayer` through casts that the `Game` type does not
 * declare. Drop a field those consumers use and nothing fails to compile: a
 * game silently stops being joinable, which is invisible until someone cannot
 * join their friend.
 *
 * So this asserts the only thing that matters — that a projected game answers
 * identically to the full one — across every game in the catalog rather than a
 * handful of examples, because the fields in question vary game by game.
 */
const STATUSES = ["playing", "online", "offline", "browsing"] as const;

describe("the join-catalog projection", () => {
  it("has games to check", () => {
    // Guards against the suite silently passing on an empty catalog.
    expect(seedGames.length).toBeGreaterThan(50);
  });

  it("preserves supportsMultiplayer for every game", () => {
    const differing = seedGames
      .filter((game) => supportsMultiplayer(game) !== supportsMultiplayer(toJoinCatalogGame(game)))
      .map((game) => game.slug);
    expect(differing).toEqual([]);
  });

  it("preserves resolveJoinCapability for every game and status", () => {
    const differing: string[] = [];
    for (const game of seedGames) {
      const projected = toJoinCatalogGame(game);
      for (const friendStatus of STATUSES) {
        const full = resolveJoinCapability({ game, friendStatus, friendGameId: game.slug });
        const slim = resolveJoinCapability({
          game: projected,
          friendStatus,
          friendGameId: game.slug,
        });
        if (JSON.stringify(full) !== JSON.stringify(slim)) {
          differing.push(`${game.slug} (${friendStatus})`);
        }
      }
    }
    expect(differing).toEqual([]);
  });

  it("preserves the slug -> title mapping the friends list builds", () => {
    for (const game of seedGames) {
      const projected = toJoinCatalogGame(game);
      expect(projected.slug).toBe(game.slug);
      expect(projected.title).toBe(game.title);
    }
  });

  it("carries no field the join path does not read", () => {
    // The projection's value is its size; an accidental `...game` would keep
    // every assertion above passing while restoring the full payload.
    const keys = Object.keys(toJoinCatalogGame(seedGames[0])).sort();
    expect(keys).toEqual(
      ["browserPlayable", "features", "launchMethods", "slug", "tags", "title"].sort()
    );
  });
});
