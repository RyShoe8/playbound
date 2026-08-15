/**
 * Resolve every install recipe against its real upstream and record the result.
 *
 * Run on a schedule (see .github/workflows/recipe-health.yml). The output is
 * committed to src/lib/data/recipeHealth.json so the site can show how fresh
 * the last check was and hide one-click buttons for recipes that are currently
 * broken — deliberately a file rather than a database row, so the signal works
 * without a database round-trip on every page render.
 *
 * Usage:
 *   npx tsx scripts/check-recipe-health.ts            # check, print, write json
 *   npx tsx scripts/check-recipe-health.ts --dry-run  # check and print only
 *   npx tsx scripts/check-recipe-health.ts --fail     # exit 1 if anything broke
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const OUT = resolve(process.cwd(), "src/lib/data/recipeHealth.json");
/** Upstreams rate-limit and some are slow; a few at a time is plenty. */
const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    })
  );
  return results;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const failOnBroken = process.argv.includes("--fail");

  const { checkRecipe, summarize } = await import("../src/lib/recipeHealth/check");
  const { collectAllRecipes } = await import("../src/lib/recipeHealth/collect");

  const recipes = collectAllRecipes();
  console.log(`Checking ${recipes.length} recipe(s) against live upstreams…\n`);

  const checks = await mapWithConcurrency(recipes, CONCURRENCY, async (r) => {
    const result = await checkRecipe(r);
    const mark = result.status === "ok" ? "ok  " : result.status === "skipped" ? "skip" : "FAIL";
    console.log(
      `  ${mark}  ${result.id}${result.status === "ok" ? `  (${result.resolved ?? ""})` : ""}`
    );
    if (result.status !== "ok" && result.detail) console.log(`          ${result.detail}`);
    return result;
  });

  const report = summarize(checks);
  console.log(
    `\n${report.ok} ok · ${report.broken} broken · ${report.skipped} skipped` +
      ` — checked ${report.checkedAt}`
  );

  if (report.broken > 0) {
    console.log("\nBroken recipes:");
    for (const f of report.failures) console.log(`  ${f.id} — ${f.detail}`);
  }

  if (!dryRun) {
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${OUT}`);
  }

  process.exit(failOnBroken && report.broken > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("check-recipe-health failed:", err);
  process.exit(1);
});
