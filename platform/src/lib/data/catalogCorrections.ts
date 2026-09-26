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

  /*
   * 1.0 released 3 December 2010 — Wikipedia infobox, OpenClonk. Its FAQ also
   * carried the "runs directly in your web browser" import-tool defect (see
   * the testing-catalog cleanup comment on the allowlist, 2026-09-25):
   * OpenClonk is a native Windows-only download (direct-installer,
   * browserPlayable: false, confirmed via admin 2026-09-25), not a browser
   * game — the live FAQ answered "Web" for platforms and "Modern web
   * browser" for the size question.
   */
  openclonk: {
    releaseYear: 2010,
    faq: [
      {
        q: "Is OpenClonk free?",
        a: "Yes. OpenClonk is released under Free to play and costs nothing to download or play.",
      },
      { q: "How big is the OpenClonk download?", a: "About 250 MB." },
      { q: "What platforms does OpenClonk run on?", a: "Windows." },
      { q: "Do I need an account to play OpenClonk?", a: "No account is required to download or play." },
    ],
  },

  // Standalone release 26 February 2014 — Wikipedia infobox, Renegade X.
  "renegade-x": { releaseYear: 2014 },

  // First release 2011; the stored 2019 was the 2.0 "Elara" release.
  "red-eclipse": { releaseYear: 2011 },

  /*
   * Had no genres at all, so it was missing from every genre filter. Its FAQ
   * and systemRequirements also carried the admin import-tool's unfilled
   * placeholder text ("About small... See official site") despite the
   * structured min/recommended CPU/GPU fields already holding real values
   * (confirmed via admin edit page, 2026-09-25) — the freeform summary
   * strings were simply never derived from them.
   */
  "c-dogs-sdl": {
    genres: ["Action", "Shooter"],
    systemRequirements: {
      min: "Windows, macOS or Linux · any x86-64 CPU from the last 15 years · integrated graphics (SDL2 2D renderer)",
      recommended: "Windows, macOS or Linux · any dual-core CPU · integrated graphics",
    },
    faq: [
      {
        q: "Is C-Dogs SDL free?",
        a: "Yes. C-Dogs SDL is released under Open Source (GPL-2.0) and costs nothing to download or play. It meets PlayBound's value criterion: no trial masquerading as a full game, no paywalled core content, and no paid competitive advantage. Optional cosmetics and premium extras are allowed.",
      },
      { q: "How big is the C-Dogs SDL download?", a: "About 100 MB." },
      { q: "What platforms does C-Dogs SDL run on?", a: "Windows, macOS, Linux." },
      { q: "Do I need an account to play C-Dogs SDL?", a: "No account is required to download or play." },
      {
        q: "Is C-Dogs SDL still active in 2026?",
        a: "Yes. C-Dogs SDL met PlayBound's \"actively maintained\" criterion when last checked on 2026-08-24 — it had a release or meaningful commit within the preceding twelve months.",
      },
      {
        q: "Is C-Dogs SDL open source?",
        a: "Yes. The source code is published at github.com/cxong/cdogs-sdl under Open Source (GPL-2.0). Open source is a nice property when it is present — it is not required to clear the PlayBound Bar.",
      },
    ],
  },

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

  /*
   * Published-catalog cleanup pass, 2026-09-25. Each of the following
   * no-seed (CMS-only) games had the same admin "Prefill from URL"
   * import-tool defect found across the catalog: an unfilled FAQ template
   * ("About small. The minimum system requirements are See official
   * site.") and, for several, a scraped-page-title leak in place of the
   * catalog's own clean title (e.g. "Daedus Homebrew - retroarch" instead
   * of "Deadeus", "Opentryrian200 - retroarch" instead of "OpenTyrian
   * 2000"). Sizes are each game's own verified sizeMB, read from the admin
   * edit page 2026-09-25; platforms/pricing in the surviving FAQ answers
   * were already correct and are kept as-is.
   */
  deadeus: {
    faq: [
      { q: "Is Deadeus free?", a: "Yes. Deadeus is released under Free / Open Source and costs nothing to download or play." },
      { q: "How big is the Deadeus download?", a: "About 2 MB." },
      { q: "What platforms does Deadeus run on?", a: "Windows." },
      { q: "Do I need an account to play Deadeus?", a: "No account is required to download or play." },
    ],
  },
  assaultcube: {
    faq: [
      { q: "Is AssaultCube free?", a: "Yes. AssaultCube is released under Open Source and costs nothing to download or play." },
      { q: "How big is the AssaultCube download?", a: "About 60 MB." },
      { q: "What platforms does AssaultCube run on?", a: "Windows, macOS, Linux." },
      { q: "Do I need an account to play AssaultCube?", a: "No account is required to download or play." },
      {
        q: "Is AssaultCube still active in 2026?",
        a: "Yes. AssaultCube met PlayBound's \"actively maintained\" criterion when last checked on 2026-08-24 — it had a release or meaningful commit within the preceding twelve months.",
      },
      {
        q: "Is AssaultCube open source?",
        a: "Yes. The source code is published at github.com/assaultcube/AC under Open Source. Open source is a nice property when it is present — it is not required to clear the PlayBound Bar.",
      },
    ],
  },
  "opentyrian-2000": {
    faq: [
      { q: "Is OpenTyrian 2000 free?", a: "Yes. OpenTyrian 2000 is released under Free / Open Source and costs nothing to download or play." },
      { q: "How big is the OpenTyrian 2000 download?", a: "About 25 MB." },
      { q: "What platforms does OpenTyrian 2000 run on?", a: "Windows." },
      { q: "Do I need an account to play OpenTyrian 2000?", a: "No account is required to download or play." },
    ],
  },
  widelands: {
    faq: [
      {
        q: "Is Widelands free?",
        a: "Yes. Widelands is released under Open Source (GPL-2.0) and costs nothing to download or play. It meets PlayBound's value criterion: no trial masquerading as a full game, no paywalled core content, and no paid competitive advantage. Optional cosmetics and premium extras are allowed.",
      },
      { q: "How big is the Widelands download?", a: "About 500 MB." },
      { q: "What platforms does Widelands run on?", a: "Windows, macOS, Linux." },
      { q: "Do I need an account to play Widelands?", a: "No account is required to download or play." },
      {
        q: "Is Widelands still active in 2026?",
        a: "Yes. Widelands met PlayBound's \"actively maintained\" criterion when last checked on 2026-08-24 — it had a release or meaningful commit within the preceding twelve months.",
      },
      {
        q: "Is Widelands open source?",
        a: "Yes. The source code is published at github.com/widelands/widelands under Open Source (GPL-2.0). Open source is a nice property when it is present — it is not required to clear the PlayBound Bar.",
      },
    ],
  },
  // These two only had the trailing "minimum system requirements are See
  // official site" clause broken — the size itself was already correct.
  "the-legend-of-zelda-book-of-mudora": {
    faq: [
      {
        q: "Is The Legend of Zelda: Book of Mudora free?",
        a: "Yes. The Legend of Zelda: Book of Mudora is released under Free · Fan Game (Non-Commercial) and costs nothing to download or play.",
      },
      { q: "How big is the The Legend of Zelda: Book of Mudora download?", a: "About 169 MB." },
      { q: "What platforms does The Legend of Zelda: Book of Mudora run on?", a: "Windows." },
      {
        q: "Do I need an account to play The Legend of Zelda: Book of Mudora?",
        a: "No account is required to download or play.",
      },
    ],
  },
  "the-legend-of-zelda-xd2-mercuris-chess": {
    faq: [
      {
        q: "Is The Legend of Zelda XD2: Mercuris' Chess free?",
        a: "Yes. The Legend of Zelda XD2: Mercuris' Chess is released under Free · Fan Game (Non-Commercial) and costs nothing to download or play.",
      },
      { q: "How big is the The Legend of Zelda XD2: Mercuris' Chess download?", a: "About 40 MB." },
      { q: "What platforms does The Legend of Zelda XD2: Mercuris' Chess run on?", a: "Windows." },
      {
        q: "Do I need an account to play The Legend of Zelda XD2: Mercuris' Chess?",
        a: "No account is required to download or play.",
      },
    ],
  },
  yarntown: {
    faq: [
      { q: "Is Yarntown free?", a: "Yes. Yarntown is released under Free · Fan Game (Non-Commercial) and costs nothing to download or play." },
      { q: "How big is the Yarntown download?", a: "About 25 MB." },
      { q: "What platforms does Yarntown run on?", a: "Windows." },
      { q: "Do I need an account to play Yarntown?", a: "No account is required to download or play." },
    ],
  },
};

/** The correction block for a slug, or undefined when there is nothing to apply. */
export function correctionsFor(slug: string): Readonly<Record<string, unknown>> | undefined {
  return CATALOG_CORRECTIONS[slug];
}
