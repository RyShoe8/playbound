import { games } from "@/lib/data/games";

/**
 * Known franchise & popular title genre map.
 * Normalized lowercase prefixes/keywords mapped to 1-3 canonical genres.
 */
const FRANCHISE_GENRE_MAP: Array<{ pattern: RegExp; genres: string[] }> = [
  // Action & Adventure / Open World
  { pattern: /watch\s*dogs/i, genres: ["Action", "Adventure", "Open World"] },
  { pattern: /grand\s*theft\s*auto|gta/i, genres: ["Action", "Adventure", "Open World"] },
  { pattern: /red\s*dead/i, genres: ["Action", "Adventure", "Open World"] },
  { pattern: /assassin'?s\s*creed/i, genres: ["Action", "Adventure", "Open World"] },
  { pattern: /far\s*cry/i, genres: ["Action", "Adventure", "Shooter"] },
  { pattern: /cyberpunk/i, genres: ["Action", "RPG", "Open World"] },
  { pattern: /deus\s*ex/i, genres: ["Action", "RPG", "Sci-Fi"] },
  { pattern: /tomb\s*raider/i, genres: ["Action", "Adventure"] },
  { pattern: /hitman/i, genres: ["Action", "Stealth"] },
  { pattern: /dishonored|prey/i, genres: ["Action", "Adventure", "Stealth"] },

  // RPG & Souls
  { pattern: /elden\s*ring|dark\s*souls|bloodborne|sekiro|demon'?s\s*souls/i, genres: ["Action", "RPG"] },
  { pattern: /witcher/i, genres: ["Action", "RPG", "Open World"] },
  { pattern: /fallout|elder\s*scrolls|skyrim|oblivion|morrowind/i, genres: ["RPG", "Open World"] },
  { pattern: /final\s*fantasy|dragon\s*quest|persona|tales\s*of/i, genres: ["RPG", "JRPG"] },
  { pattern: /yakuza|like\s*a\s*dragon/i, genres: ["Action", "RPG"] },
  { pattern: /disco\s*elysium/i, genres: ["RPG", "Narrative"] },
  { pattern: /van\s*helsing|diablo|grim\s*dawn|torchlight/i, genres: ["Action", "RPG", "Hack & Slash"] },
  { pattern: /omega\s*labyrinth/i, genres: ["RPG", "Roguelike"] },
  { pattern: /baldurs?\s*gate|divinity|pillars\s*of\s*eternity/i, genres: ["RPG", "Strategy"] },

  // Shooters & Co-op
  { pattern: /borderlands/i, genres: ["Action", "Shooter", "RPG"] },
  { pattern: /back\s*4\s*blood|left\s*4\s*dead/i, genres: ["Action", "Shooter", "Co-op"] },
  { pattern: /doom|wolfenstein|quake/i, genres: ["Action", "Shooter"] },
  { pattern: /metro\s*(2033|last\s*light|exodus)?/i, genres: ["Action", "Shooter", "Survival"] },
  { pattern: /sprawl/i, genres: ["Action", "Shooter", "Cyberpunk"] },
  { pattern: /suicide\s*squad|batman|gotham\s*knights/i, genres: ["Action", "Adventure"] },
  { pattern: /for\s*honor/i, genres: ["Action", "Fighting"] },
  { pattern: /mortal\s*kombat|street\s*fighter|tekken/i, genres: ["Fighting", "Action"] },

  // Survival & Horror
  { pattern: /dead\s*island|dying\s*light/i, genres: ["Action", "Survival", "Horror"] },
  { pattern: /resident\s*evil|silent\s*hill/i, genres: ["Horror", "Survival", "Action"] },
  { pattern: /dead\s*space|the\s*callisto\s*protocol/i, genres: ["Horror", "Sci-Fi", "Action"] },
  { pattern: /subnautica|the\s*forest|green\s*hell/i, genres: ["Survival", "Adventure"] },

  // Strategy, RTS, 4X & Tactics
  { pattern: /civilization|humankind|old\s*world/i, genres: ["Strategy", "Turn-Based", "4X"] },
  { pattern: /endless\s*(legend|space)/i, genres: ["Strategy", "4X", "Turn-Based"] },
  { pattern: /company\s*of\s*heroes|age\s*of\s*empires|command\s*(&|and)\s*conquer/i, genres: ["Strategy", "RTS"] },
  { pattern: /total\s*war/i, genres: ["Strategy", "RTS", "Turn-Based"] },
  { pattern: /crusader\s*kings|europa\s*universalis|stellaris|hearts\s*of\s*iron/i, genres: ["Strategy", "Grand Strategy"] },
  { pattern: /xcom|jagged\s*alliance|desperados|shadow\s*tactics/i, genres: ["Strategy", "Tactics"] },
  { pattern: /shogun\s*showdown/i, genres: ["Strategy", "Roguelike"] },
  { pattern: /the\s*crust/i, genres: ["Strategy", "Simulation", "Sci-Fi"] },
  { pattern: /heroes\s*of\s*might/i, genres: ["Strategy", "Turn-Based", "Fantasy"] },

  // Simulation, Management & Tycoon
  { pattern: /train\s*sim|railroad/i, genres: ["Simulation"] },
  { pattern: /flight\s*sim|flightgear/i, genres: ["Simulation"] },
  { pattern: /graveyard\s*keeper|stardew|harvest/i, genres: ["Simulation", "RPG"] },
  { pattern: /tycoon|hospital|planet\s*coaster|planet\s*zoo|jurassic\s*world/i, genres: ["Simulation", "Management"] },
  { pattern: /cities:\s*skylines|simcity/i, genres: ["Simulation", "City Builder"] },

  // Platformer & Metroidvania
  { pattern: /rayman|sonic|mario|celeste|hollow\s*knight|ori\s*and|guacamelee|spelunky|shovel\s*knight|dead\s*cells|castlevania|crash\s*bandicoot|spyro|mega\s*man|metroid/i, genres: ["Platformer", "Action"] },

  // Racing & Sports
  { pattern: /the\s*crew|forza|need\s*for\s*speed|burnout|grid|dirt|wrc|f1|assetto|project\s*cars|hot\s*wheels|trackmania|wreckfest/i, genres: ["Racing"] },
  { pattern: /inertial\s*drift|rims/i, genres: ["Racing", "Simulation"] },
  { pattern: /riders\s*republic|steep|skate/i, genres: ["Sports", "Racing"] },

  // Narrative, Puzzle & Adventure
  { pattern: /beyond:\s*two\s*souls|heavy\s*rain|detroit/i, genres: ["Adventure", "Narrative"] },
  { pattern: /life\s*is\s*strange|walking\s*dead/i, genres: ["Adventure", "Narrative"] },
  { pattern: /mindcop/i, genres: ["Adventure", "Puzzle", "Detective"] },
  { pattern: /under\s*the\s*waves/i, genres: ["Adventure", "Narrative"] },
  { pattern: /star\s*wars\s*outlaws/i, genres: ["Action", "Adventure", "Sci-Fi"] },
];

/**
 * Keyword-based heuristics when title does not match a known franchise.
 */
const KEYWORD_RULES: Array<{ pattern: RegExp; genres: string[] }> = [
  { pattern: /\b(platformer|platforming|platform|metroidvania)\b/i, genres: ["Platformer", "Action"] },
  { pattern: /\b(roguelike|roguelite|dungeon\s*crawler)\b/i, genres: ["Roguelike", "Action"] },
  { pattern: /\b(racer|racing|rally|drift|speedway|motorsport|kart)\b/i, genres: ["Racing"] },
  { pattern: /\b(sport|sports|football|soccer|basketball|hockey|baseball|golf|tennis|skate|snowboard)\b/i, genres: ["Sports"] },
  { pattern: /\b(tactics?|tactical)\b/i, genres: ["Strategy", "Tactics"] },
  { pattern: /\b(simulator|simulation|sim)\b/i, genres: ["Simulation"] },
  { pattern: /\b(tycoon|management|manager|builder)\b/i, genres: ["Simulation", "Strategy"] },
  { pattern: /\b(rpg|role-playing|roleplaying)\b/i, genres: ["RPG"] },
  { pattern: /\b(strategy|rts|4x)\b/i, genres: ["Strategy"] },
  { pattern: /\b(shooter|sniper|fps)\b/i, genres: ["Action", "Shooter"] },
  { pattern: /\b(puzzle|mystery|detective)\b/i, genres: ["Puzzle", "Adventure"] },
  { pattern: /\b(fighting|fighter|brawler)\b/i, genres: ["Fighting", "Action"] },
  { pattern: /\b(horror|zombie|dead|undead)\b/i, genres: ["Action", "Horror"] },
  { pattern: /\b(surviv(al|or))\b/i, genres: ["Survival", "Action"] },
  { pattern: /\b(deckbuilder|card\s*game)\b/i, genres: ["Strategy", "Card Game"] },
  { pattern: /\b(quest|chronicles|legend|fantasy)\b/i, genres: ["RPG", "Adventure"] },
  { pattern: /\b(war|battle|combat|strike|force)\b/i, genres: ["Action", "Strategy"] },
];

/**
 * Normalizes title string for catalog comparison.
 */
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Infers 1 to 3 relevant genres for any game deal or free offer.
 * Never returns an empty array.
 */
export function inferGameGenres(
  title: string | null | undefined,
  existingGenres?: string[] | null
): string[] {
  // If clean genres already exist, filter, deduplicate and use them
  if (existingGenres && Array.isArray(existingGenres) && existingGenres.length > 0) {
    const cleaned = existingGenres
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0 && !/^(game|all|other)$/i.test(g));
    if (cleaned.length > 0) {
      return [...new Set(cleaned)].slice(0, 3);
    }
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle) return ["Action", "Adventure"];

  // 1. Try matching with PlayBound's catalog
  const normalizedTitle = normalizeForMatch(cleanTitle);
  const catalogMatch = games.find((g) => {
    const catalogNorm = normalizeForMatch(g.title);
    return (
      catalogNorm === normalizedTitle ||
      normalizedTitle.startsWith(catalogNorm) ||
      catalogNorm.startsWith(normalizedTitle)
    );
  });
  if (catalogMatch && catalogMatch.genres && catalogMatch.genres.length > 0) {
    return catalogMatch.genres.slice(0, 3);
  }

  // 2. Try franchise map
  for (const item of FRANCHISE_GENRE_MAP) {
    if (item.pattern.test(cleanTitle)) {
      return item.genres;
    }
  }

  // 3. Try keyword heuristics
  for (const item of KEYWORD_RULES) {
    if (item.pattern.test(cleanTitle)) {
      return item.genres;
    }
  }

  // 4. Default universal genre pair so every game has a clean genre badge
  return ["Action", "Adventure"];
}
