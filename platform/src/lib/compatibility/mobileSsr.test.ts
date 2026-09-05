import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGameCompatible } from "@/lib/compatibility/compatibility";

/**
 * Desktop-only games must not paint on a phone and then disappear.
 *
 * The root layout is static — nothing calls cookies() — and useDevice only
 * resolves after hydration, so every server-rendered listing is the desktop
 * set. Of 94 published games, 74 are desktop-only, so a phone painted most of
 * a catalog it was about to remove.
 *
 * The fix is a server-stamped attribute plus a media query, chosen over a
 * device-hint cookie for two reasons: reading cookies() in the root layout
 * would make every route dynamic (the site is prerendered today), and
 * dropping those games from the mobile HTML would cost their internal links
 * under mobile-first indexing. Hiding keeps both.
 */

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const CSS = read("src", "app", "globals.css");
const CARD = read("src", "components", "GameCard.tsx");
const HERO = read("src", "components", "HomeHero.tsx");
const FILTER = read("src", "hooks", "useCompatibilityFilter.tsx");

describe("the attribute the stylesheet keys on", () => {
  it("GameCard stamps mobile compatibility on the server", () => {
    expect(CARD).toMatch(/data-mobile-compat=\{isGameCompatible\(game, "mobile"\) \? "true" : "false"\}/);
  });

  it("it reflects the real filter, not a hand-rolled platform check", () => {
    // The one source of truth for compatibility; a second copy would drift.
    expect(CARD).toMatch(/from "@\/lib\/compatibility\/compatibility"/);
  });
});

describe("the stylesheet", () => {
  it("hides incompatible games below the mobile breakpoint", () => {
    expect(CSS).toMatch(/@media \(max-width: 767px\)/);
    expect(CSS).toMatch(/\[data-mobile-compat="false"\]\s*\{\s*display:\s*none;/);
  });

  it("gives them back to a viewer who chose to see all games", () => {
    /*
     * "Compatible only" is the default, so hiding is right for a first paint.
     * Someone who opted into all games must not be silently filtered — CSS
     * cannot read that preference, so the client mirrors it onto <html>.
     */
    expect(CSS).toMatch(/html\.compat-show-all \[data-mobile-compat="false"\]/);
    expect(FILTER).toMatch(/classList\.toggle\("compat-show-all", mode === "all"\)/);
  });

  it("switches the hero rather than hiding it", () => {
    // Hiding the only spotlight would leave a hole where the hero was.
    expect(CSS).toMatch(/\[data-hero-variant="desktop"\]/);
    expect(CSS).toMatch(/\[data-hero-variant="mobile"\]/);
  });
});

describe("the hero understudy", () => {
  it("is only rendered when the desktop pick is not phone-compatible", () => {
    expect(HERO).toMatch(/const needsMobileVariant = Boolean\(/);
    expect(HERO).toMatch(/mobileHero\.slug !== hero\?\.slug/);
  });

  it("puts the variant on the hero's own root, not a wrapper", () => {
    /*
     * A wrapper would need display:contents to keep the layout, which ties
     * with the hide rule on specificity and resolves by stylesheet order.
     */
    expect(HERO).toMatch(/data-hero-variant=\{variant\}/);
    expect(HERO).not.toMatch(/className="contents"/);
  });
});

describe("the premise all of this rests on", () => {
  it("desktop-only games really are incompatible with mobile", () => {
    const desktopOnly = {
      slug: "x",
      platforms: ["Windows", "macOS", "Linux"],
      browserPlayable: false,
      steamDeck: false,
    } as never;
    expect(isGameCompatible(desktopOnly, "desktop")).toBe(true);
    expect(isGameCompatible(desktopOnly, "mobile")).toBe(false);
  });

  it("a game listing Android is mobile-compatible and must not be hidden", () => {
    /*
     * Re-Volt, which a bug report named as desktop-only. It lists Android, so
     * it belongs on a phone — the real complaint there was the install button,
     * not the listing.
     */
    const reVolt = {
      slug: "re-volt-rvgl",
      platforms: ["Windows", "macOS", "Linux", "Android"],
      browserPlayable: false,
      steamDeck: false,
    } as never;
    expect(isGameCompatible(reVolt, "mobile")).toBe(true);
  });

  it("a browser game is compatible everywhere", () => {
    const browser = { slug: "b", platforms: ["Windows"], browserPlayable: true } as never;
    expect(isGameCompatible(browser, "mobile")).toBe(true);
  });
});
