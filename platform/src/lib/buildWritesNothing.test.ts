import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A deploy must not write to the catalog.
 *
 * The catalog is curated, so the correct number of rows for a build to create
 * is zero. This used to be untrue — `build` ended with `seed:deploy` — and the
 * failure mode if it comes back is quiet: a deploy that was only meant to ship
 * a style change also touches game data, and nothing in the build output says
 * so loudly enough to notice.
 *
 * Asserting on package.json rather than on behaviour because the build chain is
 * the thing that has to stay clean, and a string in a script is exactly where
 * this regresses.
 */
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
) as { scripts: Record<string, string> };

/** Anything that reaches the database. Read-only steps are fine. */
const WRITING_STEPS = [/\bseed[:\-]/i, /\bmigrate\b/i, /\bsync:?catalog\b/i];

function stepsOf(script: string): string[] {
  return script
    .split(/&&|\|\||;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("the build chain", () => {
  it("runs no seeding step", () => {
    const steps = stepsOf(pkg.scripts.build ?? "");
    const writers = steps.filter((step) => WRITING_STEPS.some((re) => re.test(step)));
    expect(writers).toEqual([]);
  });

  it("is only next build plus read-only checks", () => {
    // Pinned exactly. A new step here should be a deliberate decision with a
    // reviewer, not something that arrives inside an unrelated change.
    expect(pkg.scripts.build).toBe("next build && npm run check:auth-urls");
  });

  it("keeps the seeding scripts available to run by hand", () => {
    // Removing them from the build is not the same as deleting them; they are
    // still the supported way to create an absent row for a named game.
    for (const name of [
      "seed:deploy",
      "seed:missing-mods",
      "seed:missing-games",
      "seed:missing-editions",
    ]) {
      expect(pkg.scripts[name], `${name} should still be defined`).toBeTruthy();
    }
  });

  it("keeps every seeding script scoped to named slugs", () => {
    // seed:deploy is the one with a baked-in list; it must still name its games
    // rather than running unscoped.
    expect(pkg.scripts["seed:deploy"]).toMatch(/--games\s+\S+/);
  });
});
