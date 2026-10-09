import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The game page is the page worth ranking, so its body has to carry the
 * content.
 *
 * Only the active tab renders server-side — `{tab === "media" && <MediaTab/>}`
 * — and every ?tab= variant canonicalises to the hub. So anything living only
 * behind a tab is in the HTML of a URL that tells Google to look elsewhere,
 * and absent from the URL it points at. Media was in exactly that position:
 * screenshots and trailers that rank on the strength of their host page,
 * hosted nowhere that counted.
 */

const PAGE = readFileSync(
  path.join(process.cwd(), "src", "app", "games", "[slug]", "page.tsx"),
  "utf8"
);

/** The body of OverviewTab, brace-matched from its declaration. */
function overviewTab(): string {
  const start = PAGE.indexOf("async function OverviewTab(");
  expect(start, "OverviewTab not found — the game page has been restructured").toBeGreaterThan(-1);
  let i = PAGE.indexOf("{", PAGE.indexOf(")", start));
  let depth = 0;
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === "{") depth += 1;
    else if (PAGE[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return PAGE.slice(start, i + 1);
}

describe("media lives in its own tab, second after Overview", () => {
  it("the overview does not embed the gallery again", () => {
    /*
     * The gallery used to be repeated at the bottom of the overview as well as
     * behind the Media tab. The hero reel already carries the media on the
     * overview, so the duplicate block is gone.
     */
    expect(overviewTab()).not.toMatch(/<MediaTab game=\{game\} \/>/);
  });

  it("the tab order is Overview, Media, Editions, Install, then the rest", () => {
    const order = [...PAGE.matchAll(/data-tab="(overview|media|editions|install)"/g)].map((m) => m[1]);
    expect(order.slice(0, 4)).toEqual(["overview", "media", "editions", "install"]);
    const list = PAGE.slice(PAGE.indexOf("const tabs = ["), PAGE.indexOf("] as const;"));
    const at = (name: string) => list.indexOf(`"${name}"`);
    expect(at("media")).toBeGreaterThan(at("overview"));
    expect(at("editions")).toBeGreaterThan(at("media"));
    expect(at("install")).toBeGreaterThan(at("editions"));
  });

  it("Media and Editions are not listed a second time with the trailing tabs", () => {
    expect(PAGE).toMatch(/t !== "install" && t !== "media" && t !== "editions"/);
  });

  it("the Editions tab only appears for games that have a real choice of edition", () => {
    expect(PAGE).toMatch(/\(choosable \|\| tab === "editions"\)/);
    expect(PAGE).toMatch(/\{tab === "editions" && \(/);
  });

  it("the tab is gated on there being media, so it never opens onto nothing", () => {
    expect(PAGE).toMatch(/hasMedia\(game\) \|\| tab === "media"/);
    expect(PAGE).toMatch(/function hasMedia\(game: Game\): boolean/);
  });

  it("hasMedia counts both screenshots and videos", () => {
    const fn = PAGE.slice(PAGE.indexOf("function hasMedia("), PAGE.indexOf("function MediaTab("));
    expect(fn).toContain("game.screenshots");
    expect(fn).toContain("game.videos");
  });

  it("the media tab still exists for people who want only the gallery", () => {
    // Removing it would break every existing ?tab=media link.
    expect(PAGE).toMatch(/\{tab === "media" && <MediaTab game=\{game\} \/>\}/);
  });

  it("only the active tab renders, which is why the above matters", () => {
    /*
     * If this ever became "render every tab and hide with CSS", the hub would
     * already contain everything and the promoted routes would become real
     * duplicates of it.
     */
    for (const tab of ["media", "reviews", "discussion"]) {
      expect(PAGE, `${tab} is no longer conditionally rendered`).toMatch(
        new RegExp(`\\{tab === "${tab}" &&`)
      );
    }
  });
});

describe("controls on the game page, and the page they link to", () => {
  it("the overview shows a controls summary", () => {
    expect(overviewTab()).toMatch(/<GameControlsSummary game=\{game\} \/>/);
  });

  it("the summary is an h2, the dedicated page an h1", () => {
    /*
     * Same subject, different jobs. Two h1s saying "<game> controls" across
     * two URLs is the shape that makes Google pick one and drop the other.
     */
    const summary = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "GameControlsSummary.tsx"),
      "utf8"
    );
    const full = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "GameControlsContent.tsx"),
      "utf8"
    );
    // Strip comments first: the components discuss h1 and h2 in prose, and
    // matching that would test the documentation rather than the markup.
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code(summary)).toMatch(/<h2[^>]*>\{game\.title\} controls<\/h2>/);
    expect(code(summary)).not.toMatch(/<h1/);
    expect(code(full)).toMatch(/<h1/);
  });

  it("the summary previews rather than reprints, and links onward", () => {
    // If it showed everything, /controls would be a duplicate of a section
    // of the hub and would deserve to be dropped.
    const summary = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "GameControlsSummary.tsx"),
      "utf8"
    );
    expect(summary).toMatch(/const PREVIEW_ROWS = \d+/);
    expect(summary).toMatch(/\.slice\(0, PREVIEW_ROWS\)/);
    expect(summary).toMatch(/href=\{`\/games\/\$\{game\.slug\}\/controls`\}/);
  });

  it("the controls route 404s when there is nothing to show", () => {
    // A promoted URL that renders an empty section is a thin page.
    expect(PAGE).toMatch(/tab === "controls" && !hasControls\(game\.controls\)\) notFound\(\)/);
  });
});

describe("controls sits straight after Install", () => {
  it("is listed before servers in the promoted routes", () => {
    const list = PAGE.slice(PAGE.indexOf("const PROMOTED_ROUTES = ["), PAGE.indexOf("] as const;", PAGE.indexOf("const PROMOTED_ROUTES")));
    expect(list.indexOf('key: "controls"')).toBeGreaterThan(-1);
    expect(list.indexOf('key: "controls"')).toBeLessThan(list.indexOf('key: "servers"'));
  });
});
