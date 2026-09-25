import { writeFileSync } from "node:fs";
import { games } from "../src/lib/data/games";
const rows = games
  .filter((g) => g.title && Array.isArray(g.genres) && g.genres.length)
  .map((g) => [g.title, g.genres.slice(0, 3)] as const);
const body = `/**
 * Title -> genres for deal/free-offer genre inference, generated from
 * src/lib/data/games.ts. Kept separate so client components that format
 * deals do not bundle the full seed catalog (~780 KB of client JS).
 * Regenerate with: npx tsx scripts/gen-catalog-genres.ts
 */
export const CATALOG_TITLE_GENRES: ReadonlyArray<readonly [string, readonly string[]]> = ${JSON.stringify(rows, null, 0).replace(/\],\[/g, "],\n  [")};
`;
writeFileSync("src/lib/storeDiscounts/catalogGenres.ts", body);
console.log(rows.length, "rows");
