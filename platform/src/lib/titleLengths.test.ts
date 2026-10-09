import { describe, expect, it } from "vitest";
import { comparisons } from "@/lib/data/comparisons";
import { alternativePages } from "@/lib/data/alternatives";
import { fitTitle, htmlLength } from "@/lib/seo";

const BRAND = htmlLength(" · PlayBound");
const total = (t: { text: string; absolute: boolean }) => htmlLength(t.text) + (t.absolute ? 0 : BRAND);

describe("page titles stay within 30–60 characters as the crawler counts them", () => {
  it("every comparison page", () => {
    for (const c of comparisons) {
      const t = fitTitle([`${c.title} — Which Should You Play?`, `${c.title}: Which to Play?`, c.title]);
      expect(total(t), c.slug).toBeLessThanOrEqual(60);
      expect(total(t), c.slug).toBeGreaterThanOrEqual(30);
    }
  });

  it("every alternatives page, without cutting a game name", () => {
    for (const p of alternativePages) {
      const t = fitTitle([
        p.title,
        p.title.replace(/^Free Alternatives to /, "Alternatives to "),
        `Free Alternatives to ${p.commercialGame}`,
      ]);
      expect(total(t), p.slug).toBeLessThanOrEqual(60);
      expect(total(t), p.slug).toBeGreaterThanOrEqual(30);
      // Whatever wording wins, it must still name the game it is an alternative to.
      expect(t.text, p.slug).toContain(p.commercialGame.split(/[ &]/)[0]);
    }
  });
});
