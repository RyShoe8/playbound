/**
 * Verified field corrections for published games that have no seed entry.
 *
 * `insert-catalog-wave` patches from `games.ts`, so a game curated entirely
 * through the admin CMS has no source to patch from and the wave refuses it.
 * That is the right default — it is what stops a blank seed silently blanking
 * live content — but it leaves no safe route for a one-field fix to a
 * DB-only game. This is that route: an explicit, reviewed value per field,
 * merged over the seed when one exists and standing alone when it does not.
 *
 * Field-scoped writes still go through PATCH_GAME_FIELDS, so nothing here is
 * applied unless the slug and field are both allowlisted for the wave.
 *
 * Every entry records where the value came from. A correction without a
 * source is a guess, and a guess is what put the wrong data here to begin
 * with: `releaseYear` had been defaulted to the year each game was added to
 * PlayBound, which is why sixteen titles claimed to have shipped in 2026.
 */
const CATALOG_CORRECTIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  // Released 27 May 2007 ("Birdie Beta") — Wikipedia infobox, Teeworlds.
  // The GitHub repo only dates to 2010 and is not the release date.
  teeworlds: { releaseYear: 2007 },

  // In games.ts as 2020, but this slug is patched from its own source block
  // (install + steps), so the seed value never reaches the wave. Listed here
  // so the overlay supplies it.
  "space-station-14": { releaseYear: 2020 },

  // 1.0 released 3 December 2010 — Wikipedia infobox, OpenClonk.
  openclonk: { releaseYear: 2010 },

  // Standalone release 26 February 2014 — Wikipedia infobox, Renegade X.
  "renegade-x": { releaseYear: 2014 },

  // First release 2011; the stored 2019 was the 2.0 "Elara" release.
  "red-eclipse": { releaseYear: 2011 },

  // Had no genres at all, so it was missing from every genre filter.
  "c-dogs-sdl": { genres: ["Action", "Shooter"] },

  // The only published game with no thatOneThing.
  "next-gen-chess": {
    thatOneThing:
      "You can resize the board — push it past 8×8 and every opening you have memorised quietly stops being worth anything.",
  },

  // theme-hospital has no seed row (CMS-only). Its systemRequirements were
  // entered as the placeholder "See the GOG store page" instead of real
  // values, and comparableTo was never filled in. Requirements read from
  // GOG's own listing (gog.com/en/game/theme_hospital, checked 2026-09-25);
  // GOG's page also confirms macOS support alongside Windows, matching the
  // game's own `platforms` field.
  "theme-hospital": {
    systemRequirements: {
      min: "Windows 10/11 or macOS · 1.8 GHz CPU · 2 GB RAM · DirectX 9.0c-capable GPU · 2 GB storage (runs via DOSBox)",
      recommended: "Windows 10/11 or macOS · 2+ GHz CPU · 4 GB RAM · any DirectX 9-capable GPU · 2 GB storage",
    },
    comparableTo: [
      "Two Point Hospital",
      "Project Hospital",
      "Big Pharma",
      "Prison Architect",
      "RollerCoaster Tycoon",
    ],
  },
};

/** The correction block for a slug, or undefined when there is nothing to apply. */
export function correctionsFor(slug: string): Readonly<Record<string, unknown>> | undefined {
  return CATALOG_CORRECTIONS[slug];
}
