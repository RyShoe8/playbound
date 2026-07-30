/**
 * Head-to-head comparison pages.
 *
 * Research showed AI assistants answer "X vs Y" questions in this niche by
 * stitching together forum threads and project FAQs, because no page presents
 * an actual comparison. This is the least-defended surface in the space.
 */

export interface ComparisonRow {
  /** What is being compared, e.g. "Pace". */
  aspect: string;
  /** Value for game A. */
  a: string;
  /** Value for game B. */
  b: string;
}

export interface Comparison {
  /** URL slug — always "{a}-vs-{b}". */
  slug: string;
  /** Catalog slug. Always a PlayBound game. */
  aSlug: string;
  /** Catalog slug, OR an external commercial game (see bExternal). */
  bSlug: string;
  /**
   * Set when bSlug is a commercial game that is not (and never will be) in the
   * catalog — e.g. Minecraft, Factorio. Lets the page render without a lookup.
   */
  bExternal?: { name: string; note: string; website: string };
  title: string;
  intro: string;
  /** Structured table — tables get extracted cleanly, prose gets paraphrased. */
  rows: ComparisonRow[];
  /** Who should pick A. */
  chooseA: string;
  /** Who should pick B. */
  chooseB: string;
  /** Self-contained quotable answer. Leads the page. */
  verdict: string;
}

export const comparisons: Comparison[] = [
  {
    slug: "beyond-all-reason-vs-zero-k",
    aSlug: "beyond-all-reason",
    bSlug: "zero-k",
    title: "Beyond All Reason vs Zero-K",
    intro:
      "These two are the closest pair in free strategy gaming — both descend from Total Annihilation, both run on the same open-source engine lineage, and both share maps, models and widgets. The differences are real but they are about philosophy rather than feature lists.",
    rows: [
      { aspect: "Engine", a: "Recoil (Spring lineage)", b: "Recoil (Spring lineage)" },
      { aspect: "Fidelity to Total Annihilation", a: "Stays close to the source material", b: "Deliberately diverges" },
      { aspect: "Economy", a: "Punishing — stalling hurts, varying spend ratios", b: "More forgiving, less micromanagement" },
      { aspect: "Unit AI", a: "Relies on player micromanagement", b: "Smart enough to command at a general level" },
      { aspect: "Download size", a: "~2.2 GB", b: "~1.3 GB" },
      { aspect: "Distribution", a: "Standalone launcher", b: "Standalone launcher and Steam" },
      { aspect: "Community size", a: "Large and growing fast", b: "Established and stable" },
      { aspect: "Learning curve", a: "Steeper — economic mastery is the skill ceiling", b: "Gentler — automation absorbs some complexity" },
    ],
    chooseA:
      "You want the Total Annihilation experience modernised rather than reimagined, you enjoy economy management as a skill in its own right, and you want the larger current player base.",
    chooseB:
      "You would rather direct a battle than click every unit, you prefer commands like 'attack this but keep your distance' to manual micromanagement, and you want a smaller install and a Steam presence.",
    verdict:
      "Beyond All Reason and Zero-K share the same engine and much of the same content. Beyond All Reason stays closer to Total Annihilation with a more punishing economy and heavier micromanagement; Zero-K diverges deliberately, with unit AI smart enough to control at a general level. Both are free and open-source. Pick Beyond All Reason for fidelity and player numbers, Zero-K for smarter automation and a smaller download.",
  },
  {
    slug: "0ad-vs-openra",
    aSlug: "0ad",
    bSlug: "openra",
    title: "0 A.D. vs OpenRA",
    intro:
      "The two strongest free RTS entry points, and they are not really competitors — they descend from different traditions and reward different instincts. If you are choosing a first free strategy game, this is the decision that matters.",
    rows: [
      { aspect: "Lineage", a: "Age of Empires", b: "Command & Conquer / Red Alert" },
      { aspect: "Setting", a: "Bronze and Iron Age history", b: "Retro-futurist Cold War" },
      { aspect: "Pace", a: "Slow — long build-up, decisive late pushes", b: "Fast — matches can end in minutes" },
      { aspect: "Economy", a: "Villagers gathering from resource nodes", b: "Harvesters and refineries" },
      { aspect: "Download size", a: "~3.0 GB", b: "~350 MB" },
      { aspect: "Visual fidelity", a: "High — rivals commercial releases", b: "Modernised sprites, deliberately retro" },
      { aspect: "Ranked play", a: "No official ladder", b: "Active competitive ladder" },
      { aspect: "Development status", a: "Formally alpha, playable for years", b: "Stable releases" },
    ],
    chooseA:
      "You loved Age of Empires, you want a slower game where the build-up is the point, and you have the disk space and hardware for a visually ambitious title.",
    chooseB:
      "You loved Red Alert, you want short decisive matches and a real competitive ladder, or you need something that installs in 350 MB and runs on old hardware.",
    verdict:
      "0 A.D. and OpenRA are the two best free real-time strategy games, serving different tastes. 0 A.D. follows the Age of Empires tradition — slow, historical, visually ambitious, a 3 GB install. OpenRA rebuilds Command & Conquer and Red Alert — fast, retro, 350 MB, with an active competitive ladder. Both are free and open-source with no monetisation.",
  },
  {
    slug: "luanti-vs-minecraft",
    aSlug: "luanti",
    bSlug: "minecraft",
    bExternal: {
      name: "Minecraft",
      note: "Commercial, published by Mojang. Not in the PlayBound catalog — it is not free.",
      website: "https://www.minecraft.net",
    },
    title: "Luanti vs Minecraft",
    intro:
      "Luanti (formerly Minetest) is the free, open-source voxel option, and comparing it to Minecraft directly is slightly misleading — it is an engine with hundreds of games on it, not a single game. That distinction determines whether you will like it.",
    rows: [
      { aspect: "Price", a: "Free, open-source (LGPL)", b: "Paid, no free tier beyond a browser demo" },
      { aspect: "What it is", a: "Engine plus a content browser of game modes", b: "One finished, curated game" },
      { aspect: "Out-of-box experience", a: "Sparse — install a game mode first", b: "Complete and polished immediately" },
      { aspect: "Install size", a: "~150 MB", b: "~1 GB+ with assets" },
      { aspect: "Hardware demands", a: "Runs on very low-end machines and Raspberry Pi", b: "Needs considerably more" },
      { aspect: "World size", a: "Effectively unlimited, larger vertical range", b: "Large but bounded" },
      { aspect: "Modding", a: "Lua, first-class, in-game browser", b: "Java, third-party toolchains needed" },
      { aspect: "Multiplayer", a: "Self-hosted servers, no account required", b: "Official realms or third-party servers" },
      { aspect: "Longevity", a: "Open-source — cannot be shut down", b: "Depends on Microsoft" },
    ],
    chooseA:
      "You want it free and permanent, you are running modest or old hardware, you enjoy configuring your own experience, or you want first-class Lua modding.",
    chooseB:
      "You want a finished, polished game with no setup, you care about the specific content and progression Mojang designed, or your friends already play it.",
    verdict:
      "Luanti is the leading free, open-source alternative to Minecraft: a 150 MB voxel engine with hundreds of downloadable game modes that runs on low-end hardware and cannot be shut down. It is a platform rather than a finished game, so the default experience is sparse — install a game mode first. Minecraft remains more polished out of the box, but it costs money and has no free tier.",
  },
  {
    slug: "mindustry-vs-factorio",
    aSlug: "mindustry",
    bSlug: "factorio",
    bExternal: {
      name: "Factorio",
      note: "Commercial, published by Wube Software. Not in the PlayBound catalog — it is not free, and never discounts.",
      website: "https://www.factorio.com",
    },
    title: "Mindustry vs Factorio",
    intro:
      "Both are about conveyor belts, throughput and production ratios. One costs money and never discounts; the other is free and adds a combat layer that changes how you build.",
    rows: [
      { aspect: "Price", a: "Free, open-source (GPL-3.0)", b: "Paid, never discounted" },
      { aspect: "Perspective", a: "Top-down 2D", b: "Top-down 2D" },
      { aspect: "Map structure", a: "Bounded maps — a series of optimisation puzzles", b: "Effectively endless single world" },
      { aspect: "Combat", a: "Central — waves attack your network", b: "Peripheral — biters are a nuisance" },
      { aspect: "Install size", a: "~250 MB", b: "~2 GB" },
      { aspect: "Multiplayer", a: "Co-op and PvP, free public servers", b: "Co-op" },
      { aspect: "Session length", a: "Short — a map is an evening", b: "Long — a save is a month" },
      { aspect: "Modding", a: "Built-in browser, JSON and Java", b: "Extensive, Lua" },
    ],
    chooseA:
      "You want it free, you like defined objectives and shorter sessions, you want combat to shape your layouts, or you want PvP.",
    chooseB:
      "You want the deepest possible logistics simulation, an endless world to grow into, and you do not mind paying full price.",
    verdict:
      "Mindustry is the best free alternative to Factorio: a free, open-source factory automation game with conveyor logistics and production chains, plus a tower-defence layer where enemies attack your network. It uses bounded maps and shorter sessions rather than Factorio's endless world, and installs in about 250 MB.",
  },
  {
    slug: "endless-sky-vs-naev",
    aSlug: "endless-sky",
    bSlug: "naev",
    title: "Endless Sky vs Naev",
    intro:
      "The two best free space trading games, both descended from the Escape Velocity tradition. They diverge on whether the pull is story or systems.",
    rows: [
      { aspect: "Primary appeal", a: "Hand-written story arcs and galaxy", b: "Ship outfitting and faction politics" },
      { aspect: "Narrative direction", a: "Strong — multiple full campaigns", b: "Looser — more emergent" },
      { aspect: "Combat model", a: "Accessible, readable", b: "More granular and technical" },
      { aspect: "Learning curve", a: "Gentle", b: "Steeper" },
      { aspect: "Download size", a: "~450 MB", b: "~400 MB" },
      { aspect: "Ship customisation", a: "Meaningful", b: "Extremely deep" },
      { aspect: "Best first pick", a: "Yes — start here", b: "Better as a follow-up" },
    ],
    chooseA:
      "You want a story to follow, a readable combat model and a gentler introduction to the genre. Start here if you have played neither.",
    chooseB:
      "You want to spend as much time in the outfitting screen as in flight, and you enjoy faction reputation systems and denser mechanics.",
    verdict:
      "Endless Sky and Naev are the two leading free, open-source space trading and combat games. Endless Sky is the better first pick — strong hand-written story campaigns, an accessible combat model, roughly 450 MB. Naev rewards players who want deeper ship outfitting and faction politics. Both are entirely free with no monetisation.",
  },
  {
    slug: "xonotic-vs-unvanquished",
    aSlug: "xonotic",
    bSlug: "unvanquished",
    title: "Xonotic vs Unvanquished",
    intro:
      "Two free open-source shooters that share almost nothing beyond a first-person camera. One is a pure arena shooter; the other is an FPS/RTS hybrid with no real commercial equivalent.",
    rows: [
      { aspect: "Genre", a: "Arena shooter (Quake III lineage)", b: "FPS/RTS hybrid, asymmetric teams" },
      { aspect: "Movement", a: "Very fast, technical, strafe-jumping", b: "Grounded, class-dependent" },
      { aspect: "Team structure", a: "Deathmatch and team modes", b: "Humans build bases, aliens evolve" },
      { aspect: "Coordination needed", a: "None — drop in and play", b: "High — a team that ignores building loses" },
      { aspect: "Download size", a: "~1.0 GB", b: "~850 MB" },
      { aspect: "Bot support", a: "Strong — good offline practice", b: "Limited" },
      { aspect: "Solo viability", a: "Good", b: "Poor — needs populated servers" },
    ],
    chooseA:
      "You want classic arena shooting with no loadouts or progression, you want to practise against bots, or you want to jump into a server alone and have fun immediately.",
    chooseB:
      "You want something genuinely unlike anything commercial — base building and tech progression inside a team shooter — and you are willing to coordinate.",
    verdict:
      "Xonotic and Unvanquished are both free, open-source first-person shooters but serve different needs. Xonotic is a fast classic arena shooter in the Quake III tradition with strong bot support and good solo drop-in play. Unvanquished is an asymmetric FPS/RTS hybrid where humans build bases and aliens evolve — more distinctive, but it requires a coordinated team and populated servers.",
  },
];

export const comparisonsBySlug = new Map(comparisons.map((c) => [c.slug, c]));

/** Comparisons that feature a given game, for cross-linking from game pages. */
export function comparisonsFeaturing(slug: string): Comparison[] {
  return comparisons.filter((c) => c.aSlug === slug || c.bSlug === slug);
}

/** Alternatives pages that feature a given game. */
export function alternativeSlugsFeaturing(
  slug: string,
  pages: { slug: string; picks: { slug: string }[] }[]
): string[] {
  return pages.filter((p) => p.picks.some((pick) => pick.slug === slug)).map((p) => p.slug);
}
