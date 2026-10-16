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
