import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Every model that stores a game slug has to decide what a rename does to it.
 *
 * A game slug is a foreign key by value. Renaming the catalog document updates
 * one row; everything pointing at the old slug keeps pointing at a name nothing
 * answers to. That failure is silent — no error, no broken query, just a
 * feature quietly about a game that no longer exists. It reached production as
 * "game not found" in the admin hardware section, because GearRecommendation
 * was never registered in the cascade and nothing made anyone notice.
 *
 * So this fails when a model gains a top-level `gameSlug` / `baseGameSlug` and
 * is neither registered for the cascade nor listed below as deliberately
 * excluded. It is not asserting that the list is *correct* — a human still
 * decides which way each one goes — only that the decision was made at all.
 */

const MODELS_DIR = join(process.cwd(), "src/lib/models");
const cascadeSource = readFileSync(join(process.cwd(), "src/lib/renameGameSlug.ts"), "utf8");

/**
 * Left behind on purpose, with the reason.
 *
 * Historical records describe what happened under the name it happened under.
 * Rewriting them would not fix a reference, it would falsify the record.
 */
const DELIBERATELY_EXCLUDED: Record<string, string> = {
  TelemetryEvent:
    "append-only analytics stream; the slug lives in properties, and past events " +
    "describe what happened under the name it happened under",
};

/** A schema field at the top level of the model, not nested in a sub-document. */
function hasTopLevelSlugField(source: string): boolean {
  return /^ {4}(gameSlug|baseGameSlug)\s*:\s*\{/m.test(source);
}

function modelFiles(): string[] {
  return readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => f.replace(/\.ts$/, ""));
}

/** Model identifiers the cascade actually updates. */
function registeredModels(): Set<string> {
  const names = new Set<string>();
  for (const m of cascadeSource.matchAll(/model:\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(m[1]);
  }
  // CatalogCollection is updated by hand above the loop, with the positional
  // operator, because it stores an ordered array rather than a single slug.
  if (/CatalogCollection\.updateMany/.test(cascadeSource)) names.add("CatalogCollection");
  return names;
}

describe("the game-slug rename cascade", () => {
  const registered = registeredModels();

  it("finds the models directory and the cascade", () => {
    // Guards against the whole suite passing because a path moved.
    expect(modelFiles().length).toBeGreaterThan(10);
    expect(registered.size).toBeGreaterThan(10);
  });

  it("covers every model that stores a game slug, or excludes it on purpose", () => {
    const unhandled: string[] = [];
    for (const model of modelFiles()) {
      const source = readFileSync(join(MODELS_DIR, `${model}.ts`), "utf8");
      if (!hasTopLevelSlugField(source)) continue;
      if (registered.has(model)) continue;
      if (model in DELIBERATELY_EXCLUDED) continue;
      unhandled.push(model);
    }

    expect(
      unhandled,
      unhandled.length
        ? `These models store a game slug but a rename ignores them, so a rename ` +
          `will orphan their rows: ${unhandled.join(", ")}. Either add them to ` +
          `REFERENCES in renameGameSlug.ts, or add them to DELIBERATELY_EXCLUDED ` +
          `in this test with the reason.`
        : undefined
    ).toEqual([]);
  });

  it("keeps the exclusions honest", () => {
    // An exclusion for a model that no longer exists, or that has since been
    // registered, is stale reasoning nobody will re-check.
    const files = new Set(modelFiles());
    for (const [model, reason] of Object.entries(DELIBERATELY_EXCLUDED)) {
      expect(files.has(model), `${model} is excluded but has no model file`).toBe(true);
      expect(registered.has(model), `${model} is both excluded and registered`).toBe(false);
      expect(reason.length, `${model} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("registers the collections that caused this to be written", () => {
    // The gear rows are the ones that actually broke; keeping them named here
    // means removing the registration fails loudly rather than silently.
    for (const model of ["GearRecommendation", "Edition", "LibraryEntry", "CatalogMod"]) {
      expect(registered.has(model), `${model} must follow a rename`).toBe(true);
    }
  });
});
