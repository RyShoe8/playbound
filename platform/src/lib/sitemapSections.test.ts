import { describe, expect, it } from "vitest";

// The section builders read the database; only the pure XML helpers run here.
import { SITEMAP_SECTIONS, isSitemapSection, renderSitemapIndex, renderUrlset } from "./sitemapSections";

describe("sitemap sections", () => {
  it("lists every section in the index and recognises only those", () => {
    const index = renderSitemapIndex();
    for (const section of SITEMAP_SECTIONS) {
      expect(index).toContain(`/sitemaps/${section}.xml</loc>`);
      expect(isSitemapSection(section)).toBe(true);
    }
    expect(isSitemapSection("admin")).toBe(false);
    expect(index.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("escapes URLs and omits fields that are not set", () => {
    const xml = renderUrlset([
      { url: "https://example.com/a?x=1&y=2", changeFrequency: "weekly", priority: 0.8, lastModified: "2026-10-01" },
      { url: "https://example.com/b" },
    ]);
    expect(xml).toContain("https://example.com/a?x=1&amp;y=2");
    expect(xml).toContain("<lastmod>2026-10-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(xml).toContain("<url><loc>https://example.com/b</loc></url>");
  });
});
