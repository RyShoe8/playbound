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
