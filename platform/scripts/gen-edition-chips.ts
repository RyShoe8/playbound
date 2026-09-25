import { writeFileSync } from "node:fs";
import { editions, getDisplayEditionsForGame } from "../src/lib/data/editions";
const slugs = [...new Set(editions.map((e) => e.gameSlug))].sort();
const index: Record<string, Array<[string, string]>> = {};
for (const slug of slugs) {
  const shown = getDisplayEditionsForGame(slug);
  if (shown.length) index[slug] = shown.map((e) => [e.slug, e.name]);
}
const body = `/**
 * Generated data for editionChips.ts: chips (slug, name) per game, from
 * from src/lib/data/editions.ts with getDisplayEditionsForGame's rules.
 * Client components import this instead of the full editions seed, which
 * put ~200 KB of JavaScript on nearly every page.
 * Regenerate with: npx tsx scripts/gen-edition-chips.ts
 */
export const EDITION_CHIPS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = ${JSON.stringify(index)};
`;
writeFileSync("src/lib/data/editionChipsData.ts", body);
console.log(Object.keys(index).length, "games with chips");
