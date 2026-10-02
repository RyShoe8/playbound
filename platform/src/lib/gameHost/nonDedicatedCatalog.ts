/** Catalog multiplayer titles that do not offer a PlayBound-hostable dedicated server.
 * The CMS's broad Dedicated Servers tag is not sufficient evidence of a
 * deployable server recipe. Keep these out of VPS testing and hosting pickers
 * without changing curated catalog documents. */
const NON_DEDICATED_SLUGS = new Set([
  "asherons-call",
  "beyond-all-reason",
  "city-of-heroes",
  "dragons-dogma-online",
  "final-fantasy-xi",
  "hawken",
  "hawken-hawkening",
  "marathon-2",
  "monster-hunter-frontier",
  "openspades",
  "planetside-2",
  "pokemmo",
  "pokemon-blaze-online",
  "project-celeste",
  "red-eclipse",
  "renegade-x",
  "stalker-call-of-pripyat",
  "stalker-clear-sky",
  "stalker-shadow-of-chernobyl",
  "star-wars-galaxies",
  "zero-k",
]);

const NON_DEDICATED_TITLES = new Set([
  "Asheron's Call", "Beyond All Reason", "City of Heroes", "Dragon's Dogma Online",
  "Final Fantasy XI", "Hawken", "Hawken: Hawkening", "Marathon 2",
  "Monster Hunter Frontier", "OpenSpades", "PlanetSide 2", "PokeMMO",
  "Pokémon Blaze Online", "Project Celeste", "Red Eclipse", "Renegade X",
  "S.T.A.L.K.E.R.: Call of Pripyat", "S.T.A.L.K.E.R.: Clear Sky",
  "S.T.A.L.K.E.R.: Shadow of Chernobyl", "Star Wars Galaxies", "Zero-K",
].map(normalizeTitle));

function normalizeTitle(title: string): string {
  return title.replace(/S\.T\.A\.L\.K\.E\.R\./gi, "Stalker")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "").replace(/\s+/g, " ").trim();
}

export function isNonDedicatedCatalogGame(slug: string, title?: string): boolean {
  // The CMS can name the Homecoming release separately from the base title.
  // Neither variant has a PlayBound-hostable dedicated-server recipe.
  const cityOfHeroesSlug = /^(city-of-heroes|city-of-heros)(-|$)/.test(slug);
  const normalized = title ? normalizeTitle(title) : "";
  const cityOfHeroesTitle = normalized.startsWith("cityofheroes") || normalized.startsWith("cityofheros");
  return cityOfHeroesSlug || cityOfHeroesTitle || NON_DEDICATED_SLUGS.has(slug) ||
    Boolean(normalized && NON_DEDICATED_TITLES.has(normalized));
}
