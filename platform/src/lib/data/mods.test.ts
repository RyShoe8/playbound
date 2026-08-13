import { describe, it, expect } from "vitest";
import { mods } from "./mods";
import { retiredModSlugs } from "./retiredMods";

type Seed = Record<string, string>;
const all = mods as unknown as Seed[];

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/**
 * The catalog lists mods, not links about mods. These guard the cleanup that
 * removed ~600 entries which were really wiki articles, FAQs, forum and Discord
 * landing pages, storefront listings for the base game, and repository
 * meta-pages — and would otherwise creep back in one seed at a time.
 */
describe("mod seed hygiene", () => {
  it("never lists a storefront, Discord or forum landing page", () => {
    const bad = all.filter((m) => {
      const h = host(String(m.website || ""));
      return (
        /steampowered\.com$|^gog\.com$|epicgames\.com$/.test(h) ||
        /^discord\.(gg|com)$/.test(h) ||
        /^(forum|forums)\./.test(h)
      );
    });
    expect(bad.map((m) => m.slug)).toEqual([]);
  });

  it("never lists a repository meta-page", () => {
    // Issues, discussions, milestones and licence files describe a project;
    // they are not something a reader can install.
    const bad = all.filter((m) =>
      /\/(issues|discussions|milestones|pulls)(\/|$)|\/blob\/.*\/(LICENSE|COPYING)/i.test(
        String(m.website || "")
      )
    );
    expect(bad.map((m) => m.slug)).toEqual([]);
  });

  it("gives every entry a real route to the mod", () => {
    // Either a repo / direct download, or a deep link that identifies one mod on
    // a known host. A bare category page fails, which is what most of the
    // removed entries were.
    const deep =
      /moddb\.com\/mods\/|mod\.io\/g\/[^/]+\/m\/|nexusmods\.com\/[^/]+\/mods\/|content\.luanti\.org\/packages\/|bananas\.openttd\.org\/package\//;
    const bad = all.filter((m) => {
      if (m.githubRepo || m.directUrl) return false;
      if (String(m.downloadKind || "") !== "external") return false;
      const w = String(m.website || "");
      const h = host(w);
      const segs = new URL(w).pathname.split("/").filter(Boolean);
      // A project page on a code host counts; its wiki does not.
      if (/^(github\.com|codeberg\.org|gitlab\.com)$/.test(h))
        return segs.length < 2 || segs.includes("wiki") || segs.includes("topics");
      return !deep.test(w);
    });
    expect(bad.map((m) => m.slug)).toEqual([]);
  });

  it("keeps retired slugs out of the seed so deploys do not delete then re-create them", () => {
    const seeded = new Set(all.map((m) => String(m.slug)));
    expect(retiredModSlugs.filter((s) => seeded.has(s))).toEqual([]);
  });

  it("has no duplicate retired slugs", () => {
    const dupes = retiredModSlugs.filter((s, i) => retiredModSlugs.indexOf(s) !== i);
    expect(dupes).toEqual([]);
  });
});
