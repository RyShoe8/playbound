import { describe, expect, it } from "vitest";
import { CATALOG_SLUG_BOUNDS, slugInShard } from "@/lib/catalogCacheShards";
import { games } from "@/lib/data/games";

describe("catalog cache shards", () => {
  it("assigns every game to exactly one range, including range boundaries", () => {
    const bounds: Array<string | undefined> = [undefined, ...CATALOG_SLUG_BOUNDS, undefined];
    const slugs = [...games.map((game) => game.slug), "0-a-d", "g", "n", "t", "zz-test"];
    for (const slug of slugs) {
      const matching = bounds.slice(0, -1).filter((lower, i) =>
        slugInShard(slug, lower, bounds[i + 1])
      );
      expect(matching, slug).toHaveLength(1);
    }
  });
});
