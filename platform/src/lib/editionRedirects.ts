/**
 * Editions that were retired, and where their URLs now go.
 *
 * A retired edition's page would otherwise 404 for everyone who bookmarked or
 * linked it. Values are paths relative to /games/<game>.
 */
const RETIRED_EDITION_REDIRECTS: Readonly<Record<string, string>> = {
  // The "PlayBound Edition" of Daggerfall was the same package as Daggerfall Unity.
  "daggerfall/playbound-remastered": "/editions/daggerfall-unity",
  // Listed an unlock claim PlayBound cannot deliver on a live service.
  "quake-champions/qc-champions-pack": "",
};

/** The game-relative path a retired edition now lives at, or null if it was never retired. */
export function retiredEditionRedirect(gameSlug: string, editionSlug: string): string | null {
  const target = RETIRED_EDITION_REDIRECTS[`${gameSlug}/${editionSlug}`];
  return target === undefined ? null : `/games/${gameSlug}${target}`;
}

/**
 * Editions whose slug changed. Parties, library entries and links saved under
 * the old slug keep working, because lookups resolve it to the current one.
 */
const RENAMED_EDITION_SLUGS: Readonly<Record<string, string>> = {
  // Valve asked the project to drop the name Team Fortress 2 Classic in December 2025.
  "team-fortress-2/tf2-classic": "tf2-classified",
};

/** The slug an edition goes by now; unchanged if it was never renamed. */
export function currentEditionSlug(gameSlug: string, editionSlug: string): string {
  return RENAMED_EDITION_SLUGS[`${gameSlug}/${editionSlug}`] ?? editionSlug;
}
