import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogDirectory } from "./CatalogDirectory";

describe("CatalogDirectory", () => {
  it("renders every destination in HTML without scrolling or JavaScript", () => {
    const entries = Array.from({ length: 80 }, (_, i) => ({ title: `Game ${i}`, href: `/games/game-${i}` }));
    const html = renderToStaticMarkup(<CatalogDirectory title="All games by name" entries={entries} />);
    expect(html.match(/<a /g)).toHaveLength(80);
    expect(html).toContain('href="/games/game-79"');
    expect(html).not.toContain("<noscript");
    expect(html).not.toContain('display:none');
  });

  it("alphabetizes without changing the caller's order", () => {
    const entries = [{ title: "Zulu", href: "/mods/zulu" }, { title: "Alpha", href: "/mods/alpha" }];
    const html = renderToStaticMarkup(<CatalogDirectory title="All mods by name" entries={entries} />);
    expect(html.indexOf('href="/mods/alpha"')).toBeLessThan(html.indexOf('href="/mods/zulu"'));
    expect(entries[0].title).toBe("Zulu");
  });
});
