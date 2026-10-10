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

describe("controls on the game page", () => {
  it("the overview carries the complete controls reference in its own HTML", () => {
    expect(overviewTab()).toMatch(/<section id="controls"/);
    expect(overviewTab()).toMatch(/<GameControlsContent game=\{game\} \/>/);
  });

  it("the section is an h2 with h3 sub-sections, so the page keeps one h1", () => {
    const full = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "GameControlsContent.tsx"),
      "utf8"
    );
    const code = full.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/<h1/);
    expect(code).toMatch(/<h2[^>]*>\{game\.title\} controls<\/h2>/);
  });

  it("uses the full column width rather than a centred narrow box", () => {
    const full = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "GameControlsContent.tsx"),
      "utf8"
    );
    expect(full).not.toMatch(/max-w-4xl/);
  });

  it("the old URLs redirect to the section instead of being separate pages", () => {
    expect(PAGE).toMatch(/rawTab === "controls"\) permanentRedirect\(`\/games\/\$\{game\.slug\}#controls`\)/);
    const route = readFileSync(
      path.join(process.cwd(), "src", "app", "games", "[slug]", "controls", "page.tsx"),
      "utf8"
    );
    expect(route).toMatch(/permanentRedirect\(`\/games\/\$\{game\.slug\}#controls`\)/);
  });

  it("only games with documented controls get the section", () => {
    expect(overviewTab()).toMatch(/hasControls\(game\.controls\) && \(\s*<section id="controls"/);
  });
});

describe("controls sits straight after Install", () => {
  it("is listed before servers in the promoted routes", () => {
    const list = PAGE.slice(PAGE.indexOf("const PROMOTED_ROUTES = ["), PAGE.indexOf("] as const;", PAGE.indexOf("const PROMOTED_ROUTES")));
    expect(list.indexOf('key: "controls"')).toBeGreaterThan(-1);
    expect(list.indexOf('key: "controls"')).toBeLessThan(list.indexOf('key: "servers"'));
  });
});
