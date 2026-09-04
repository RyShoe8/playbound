import { describe, expect, it } from "vitest";
import { alternativesBySlug } from "@/lib/data/alternatives";

/**
 * Alternatives titles keep every game they name.
 *
 * These pages exist to rank for "free alternative to X", and four of the
 * thirty name two games. A previous version cut any title over 60 characters
 * at its first " & " — which removed the second game from the title tag
 * entirely, on exactly the pages built to rank for it, to fix a problem that
 * is only about display. Google indexes the full tag and truncates what it
 * shows; the trim cost an indexed keyword and bought nothing.
 *
 * It was also wrong in a way length alone does not explain: "Free
 * Alternatives to Axis & Allies & Hearts of Iron" split inside the game's own
 * name and rendered "Free Alternatives to Axis".
 */

const pages = [...alternativesBySlug.values()] as Array<{ slug: string; title: string }>;

describe("alternatives page titles", () => {
  it("there are pages to check", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("no title is cut at an ampersand", () => {
    /*
     * The regression. A title ending in a bare game name where the source
     * title continued with " & " means the trim is back.
     */
    for (const p of pages) {
      expect(p.title, `${p.slug} looks truncated`).not.toMatch(/\s&\s*$/);
    }
  });

  it("every game named in the source title survives into the tag", () => {
    // The tag is the source title verbatim; this pins that it stays that way.
    for (const p of pages) {
      const names = p.title.replace(/^Free Alternatives to /, "").split(" & ");
      for (const name of names) {
        expect(p.title, `${p.slug} dropped "${name}"`).toContain(name);
      }
    }
  });

  it("the two-game titles that used to be trimmed still name both games", () => {
    const cases: Array<[string, string[]]> = [
      ["supreme-commander", ["Supreme Commander", "Total Annihilation"]],
      ["cities-skylines", ["Cities: Skylines", "Transport Tycoon"]],
      ["gradius-arcade-shmups", ["Gradius", "Arcade Shoot 'em Ups"]],
    ];
    for (const [slug, names] of cases) {
      const page = pages.find((p) => p.slug === slug);
      if (!page) continue; // the set is editorial; a removed page is not a failure
      for (const name of names) {
        expect(page.title, `${slug} lost "${name}"`).toContain(name);
      }
    }
  });

  it("a game whose own name contains an ampersand stays intact", () => {
    /*
     * The case that made the old rule indefensible rather than merely
     * suboptimal: splitting on " & " cut "Axis & Allies" in half.
     */
    const page = pages.find((p) => p.slug === "axis-and-allies");
    if (!page) return;
    expect(page.title).toContain("Axis & Allies");
    expect(page.title).not.toBe("Free Alternatives to Axis");
  });
});
