import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEDICATED_ONLY_GAMES, HOSTABLE_GAMES } from "./catalog";
import { PLAYER_LIMIT_RECIPES } from "@/lib/communityHosting/reconcile";
import { hostableProfileStubs } from "@/lib/dedicatedHosting/hostableProfiles";

const recipes = readFileSync(join(process.cwd(), "game-host/dedicatedRecipes.js"), "utf8");

function recipeBlock(slug: string) {
  const at = recipes.search(new RegExp(`\\n    "?${slug}"?: \\{`));
  return at === -1 ? null : recipes.slice(at);
}

describe("paid-plan-only games", () => {
  const slugs = Object.keys(DEDICATED_ONLY_GAMES);

  it("never appear in the lists that switch on free or party hosting", () => {
    for (const slug of slugs) expect(HOSTABLE_GAMES[slug], `${slug} must not be hostable everywhere`).toBeUndefined();
  });

  it("have a host recipe and an enforced slot cap", () => {
    for (const slug of slugs) {
      expect(recipeBlock(slug), `${slug} recipe`).not.toBeNull();
      expect(PLAYER_LIMIT_RECIPES.has(slug), `${slug} slot cap`).toBe(true);
    }
  });

  it("use the same ports as the host recipe", () => {
    for (const slug of slugs) {
      const block = recipeBlock(slug) ?? "";
      expect(DEDICATED_ONLY_GAMES[slug].defaultPort, slug).toBe(Number(block.match(/portStart: (\d+)/)?.[1]));
      expect(DEDICATED_ONLY_GAMES[slug].portEnd, slug).toBe(Number(block.match(/portEnd: (\d+)/)?.[1]));
    }
  });

  it("show up in the tier's admin list", () => {
    const keys = hostableProfileStubs([], []).map((s) => s.key);
    for (const slug of slugs) expect(keys).toContain(`${slug}:base`);
  });
});
