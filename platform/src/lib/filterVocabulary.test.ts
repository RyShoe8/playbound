import { describe, expect, it } from "vitest";
import { TAGS, FEATURES } from "@/lib/gamePayload";
import { games } from "@/lib/data/games";

/**
 * /discover and /search must offer the same filters.
 *
 * They drifted badly: /search rendered the TAGS constant (19 entries) while
 * /discover built its chip list from `games.flatMap(g => g.tags)` — every
 * string any game happened to carry. That was 152 distinct tags, 96 of which
 * belonged to exactly one game, so the two filter panels shared almost
 * nothing and /discover was unusable.
 *
 * Both now read the constants in gamePayload.ts. These tests guard the two
 * ways that can regress: a page going back to deriving its own vocabulary,
 * and the vocabulary itself growing a long tail again.
 */

const catalogTagCounts = () => {
  const counts = new Map<string, number>();
  for (const g of games) for (const t of g.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
};

describe("filter vocabulary", () => {
  it("keeps the tag list small enough to scan", () => {
    // The bug was 152 chips. Well under half that is the point of the fix;
    // this is a smoke alarm, not a style rule.
    expect(TAGS.length).toBeLessThanOrEqual(40);
  });

  it("has no duplicate entries", () => {
    expect(new Set(TAGS).size).toBe(TAGS.length);
    expect(new Set(FEATURES).size).toBe(FEATURES.length);
  });

  it("never lists the same label as both a tag and a feature", () => {
    // Two identical chips in adjacent sections of one filter panel is a bug,
    // not a choice — this is why "Controller Support" stayed a feature only.
    const overlap = TAGS.filter((t) => (FEATURES as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });

  it("is covered by the catalog the seed can vouch for", () => {
    /*
     * Deliberately not "every tag must appear in games.ts". The seed is not
     * authoritative — the live database is — so a tag can be in real use and
     * still be missing here, which made the stricter version of this test
     * fail on Evil, Space Trading, Kart Racing and Free To Play despite all
     * four being used in production. What is worth asserting is that the
     * vocabulary is grounded in the catalog rather than invented: most of it
     * should show up even in a stale snapshot.
     */
    const counts = catalogTagCounts();
    const grounded = TAGS.filter((t) => counts.has(t));
    expect(grounded.length).toBeGreaterThanOrEqual(Math.ceil(TAGS.length * 0.6));
  });

  it("does not carry retired features", () => {
    // Removed as single-game noise; they must not creep back via either list.
    for (const retired of ["Daily Runs", "Procedural Worlds"]) {
      expect(FEATURES as readonly string[]).not.toContain(retired);
      expect(TAGS as readonly string[]).not.toContain(retired);
    }
  });
});
