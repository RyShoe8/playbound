import { describe, it, expect } from "vitest";
import { mods } from "./mods";
import { retiredModSlugs } from "./retiredMods";
import { developersBySlug } from "./developers";

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
      /moddb\.com\/mods\/|mod\.io\/g\/[^/]+\/m\/|nexusmods\.com\/[^/]+\/mods\/|content\.luanti\.org\/packages\/|bananas\.openttd\.org\/package\/|steamcommunity\.com\/sharedfiles\/filedetails|live\.warthunder\.com\/post\//;
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

/**
 * Guards for the individually-verified wave. Each of these encodes a specific
 * upstream fact that a well-meaning edit could silently undo — see the header
 * and REJECTED list in verifiedModsWave.ts for why each one matters.
 */
describe("verified mods wave", () => {
  const bySlug = (slug: string) => {
    const found = all.find((m) => m.slug === slug);
    if (!found) throw new Error(`missing seed mod: ${slug}`);
    return found;
  };

  it("keeps Brewall's maps out of EverQuest's maps root", () => {
    // EverQuest rewrites ~100 default zone maps in the maps root on startup,
    // so anything installed there is silently lost. Upstream requires a named
    // subfolder.
    const brewall = bySlug("everquest-brewall-maps");
    expect(brewall.installRelativePath).toBe("maps/Brewall");
    expect(brewall.directUrl).toMatch(/^https:\/\/www\.eqmaps\.info\//);
  });

  it("keeps the eqmaps.info download unpublished until a launcher ships that host", () => {
    // Installing this on a launcher without eqmaps.info allowlisted fails with
    // DOWNLOAD_HOST_BLOCKED. Delete this test when the entry goes live.
    expect(bySlug("everquest-brewall-maps").published).toBe(false);
  });

  it("leaves Wesnoth campaigns to the in-game add-on manager", () => {
    // None of the three publish release assets, so a github-zip would fall
    // back to a `<repo>-master/` source archive — the wrong folder name for
    // Wesnoth's add-on id, and for two of them a source tree needing a build.
    const wesnoth = [
      "wesnoth-invasion-from-the-unknown",
      "wesnoth-after-the-storm",
      "wesnoth-legend-of-the-invincibles",
      "wesnoth-era-of-magic",
    ].map(bySlug);

    for (const m of wesnoth) {
      expect(m.downloadKind).toBe("external");
      expect(m.githubRepo).toBeTruthy();
      expect(m.directUrl ?? null).toBeNull();
    }
  });

  it("names a developer that actually exists", () => {
    for (const slug of [
      "everquest-brewall-maps",
      "wesnoth-invasion-from-the-unknown",
      "wesnoth-after-the-storm",
      "wesnoth-legend-of-the-invincibles",
      "wesnoth-era-of-magic",
    ]) {
      expect(developersBySlug.has(bySlug(slug).developerSlug)).toBe(true);
    }
  });
});

describe("August 2026 catalog wave", () => {
  const bySlug = (slug: string) => {
    const found = all.find((m) => m.slug === slug);
    if (!found) throw new Error(`missing seed mod: ${slug}`);
    return found;
  };

  it("adds only the missing mods, not the retired av8 stub slug", () => {
    const slugs = all.map((m) => String(m.slug));
    for (const slug of [
      "freedoom-project-brutality",
      "dfu-distant-terrain",
      "dfu-expanded-textures",
      "openttd-cztr-graphics",
      "openttd-av8-aircraft",
      "wesnoth-era-of-magic",
    ]) {
      expect(slugs).toContain(slug);
    }
    expect(slugs).not.toContain("openttd-av8");
  });

  it("keeps BaNaNaS and Nexus rows as external downloads", () => {
    expect(bySlug("openttd-cztr-graphics").downloadKind).toBe("external");
    expect(bySlug("openttd-av8-aircraft").website).toContain("bananas.openttd.org");
    expect(bySlug("dfu-distant-terrain").website).toContain("nexusmods.com");
    expect(bySlug("dfu-expanded-textures").website).toContain("/mods/307");
  });

  it("does not re-add Shattered Paradise or the retired av8 slug as new rows", () => {
    expect(all.some((m) => m.slug === "openra-shattered-paradise")).toBe(true);
    expect(all.filter((m) => m.slug === "openra-shattered-paradise")).toHaveLength(1);
  });
});
