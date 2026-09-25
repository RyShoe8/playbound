/**
 * Edition chips for game cards and the home hero.
 *
 * Client components use this instead of the editions seed (src/lib/data/
 * editions.ts), which put ~200 KB of JavaScript on nearly every page for a
 * slug and a name per chip. The data is generated with the same rules as
 * getDisplayEditionsForGame: npx tsx scripts/gen-edition-chips.ts
 */
import { EDITION_CHIPS } from "./editionChipsData";

export function getEditionChips(gameSlug: string): Array<{ slug: string; name: string }> {
  return (EDITION_CHIPS[gameSlug] || []).map(([slug, name]) => ({ slug, name }));
}

/** Strip parentheticals from an edition name for chip display. */
export function formatEditionChipName(name: string): string {
  if (!name) return "";
  const cleaned = name.replace(/\s*\([^)]*\)/g, "").trim();
  return cleaned || name;
}
