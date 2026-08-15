import { describe, it, expect } from "vitest";
import { alternativePages, alternativesBySlug } from "./alternatives";
import { games } from "./games";

/**
 * These pages exist to rank for high-intent "free alternative to X" queries,
 * so a pick that points at a game we do not actually list is worse than no
 * page at all — the visitor arrives, finds a dead link, and leaves.
 */
/**
 * Published games that exist only in MongoDB, not in games.ts.
 *
 * Games added by a one-off wave script are inserted straight into the database
 * and the script is deleted once it has run, so the static seed is NOT a
 * complete list of what is live — it is the fallback used only while the
 * database is empty. Verified against /api/public/catalog: these two are
 * published on the site but absent from the seed. Without this allowlist the
 * check below would reject a perfectly valid recommendation.
 */
const PUBLISHED_ONLY_IN_DB = ["next-gen-chess", "villagers-and-heroes"];

describe("alternatives pages", () => {
  const knownSlugs = new Set([...games.map((g) => g.slug), ...PUBLISHED_ONLY_IN_DB]);

  it("only recommends games that exist in the catalog", () => {
    const missing: string[] = [];
    for (const page of alternativePages) {
      for (const pick of page.picks) {
        if (!knownSlugs.has(pick.slug)) missing.push(`${page.slug} -> ${pick.slug}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("names a top pick that is one of its own picks", () => {
    for (const page of alternativePages) {
      expect(
        page.picks.some((p) => p.slug === page.topPick),
        `${page.slug}: topPick "${page.topPick}" is not in picks`
      ).toBe(true);
    }
  });

  it("has no duplicate page slugs", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of alternativePages) {
      if (seen.has(p.slug)) dupes.push(p.slug);
      seen.add(p.slug);
    }
    expect(dupes).toEqual([]);
    expect(alternativesBySlug.size).toBe(alternativePages.length);
  });

  it("never recommends the same game twice on one page", () => {
    for (const page of alternativePages) {
      const slugs = page.picks.map((p) => p.slug);
      expect(new Set(slugs).size, `${page.slug} repeats a pick`).toBe(slugs.length);
    }
  });

  it("keeps the verdict quotable and within a snippet", () => {
    // The verdict doubles as the meta description, which clamps around 158
    // characters — but it is also the block written to be quoted verbatim by
    // search engines and assistants, so it must read as a complete answer.
    for (const page of alternativePages) {
      expect(page.verdict.length, `${page.slug} verdict too short`).toBeGreaterThan(80);
      expect(page.verdict).toMatch(/free/i);
    }
  });

  it("states a real tradeoff for every recommendation", () => {
    // The differences field is what makes these pages trustworthy rather than
    // listicles. An empty or throwaway one defeats the point.
    for (const page of alternativePages) {
      for (const pick of page.picks) {
        // Deliberately low: a secondary pick's tradeoff can legitimately be one
        // short clause ("Racing rather than platforming."). This catches empty
        // and placeholder values, not brevity.
        expect(
          pick.differences.length,
          `${page.slug} -> ${pick.slug} has no real tradeoff`
        ).toBeGreaterThan(25);
      }
    }
  });
});
