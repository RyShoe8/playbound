/**
 * Head-to-head comparison pages.
 *
 * Research showed search engines answer "X vs Y" questions in this niche by
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

  /*
   * Second batch, 2026-09-26 — sourced from each game's own comparableTo
   * list (already curated in editorial.ts/catalogCorrections.ts), which
   * turned out to be a ready-made backlog of exactly the pairs worth
   * building a dedicated comparison page for.
   */
  {
    slug: "dune-legacy-vs-openra",
    aSlug: "dune-legacy",
    bSlug: "openra",
    title: "Dune Legacy vs OpenRA",
    intro:
      "Both rebuild classic Westwood real-time strategy games on modern open-source engines, but they picked different targets — Dune Legacy stays faithful to 1992's Dune II, OpenRA modernises Command & Conquer and Red Alert instead. If you want the actual genre ancestor rather than its more famous successors, this is the choice that matters.",
    rows: [
      { aspect: "Source game", a: "Dune II (1992)", b: "Tiberian Dawn / Red Alert / Dune 2000" },
      { aspect: "Approach", a: "Faithful remake, same pace and rules", b: "Modernised — rebalanced units, new netcode" },
      { aspect: "Download size", a: "~45 MB", b: "~350 MB" },
      { aspect: "Multiplayer", a: "Basic — LAN and internet skirmish", b: "Deep — ladder, replays, active community" },
      { aspect: "Content", a: "One campaign, one faction set", b: "Three full games, dozens of maps and mods" },
      { aspect: "Active development", a: "Maintenance mode", b: "Continuous releases for 15+ years" },
    ],
    chooseA:
      "You specifically want to experience the game that invented the genre, as close to the original as a modern build allows, and you do not need active multiplayer.",
    chooseB:
      "You want the deeper, actively maintained experience with real multiplayer, more content, and rebalanced classic C&C games.",
    verdict:
      "Dune Legacy and OpenRA both rebuild Westwood's classic RTS games for modern systems, but Dune Legacy is a faithful ~45 MB remake of Dune II specifically, while OpenRA modernises the larger Command & Conquer and Red Alert lineage with active development, a real ladder and far more content. Pick Dune Legacy for genre history, OpenRA for a game you will actually keep playing.",
  },
  {
    slug: "daggerfall-vs-morrowind",
    aSlug: "daggerfall",
    bSlug: "morrowind",
    title: "Daggerfall vs Morrowind",
    intro:
      "Two Elder Scrolls games, six years and one engine generation apart. Daggerfall (Unity) is a procedurally-generated continent the size of a real country; Morrowind (OpenMW) is a much smaller, hand-crafted island. The choice is really about scale versus craftsmanship.",
    rows: [
      { aspect: "Engine used here", a: "Daggerfall Unity", b: "OpenMW" },
      { aspect: "World generation", a: "Procedural — a landmass roughly the size of Great Britain", b: "Entirely hand-placed, much smaller" },
      { aspect: "Download size", a: "~500 MB", b: "~2.5 GB" },
      { aspect: "Quest design", a: "Procedurally generated, repeats over time", b: "Hand-written, unique per quest" },
      { aspect: "Combat", a: "Classic, simpler swing-based", b: "More developed skill and stat system" },
      { aspect: "Mod scene", a: "Large, engine-focused (DFU is open-source)", b: "One of gaming's largest, decades deep" },
      { aspect: "Best first pick", a: "If scale and emergent stories excite you", b: "If you want a tighter, more authored world" },
    ],
    chooseA:
      "You want an almost incomprehensibly large world, are fine with procedurally-repeating quests, and like the idea of a truly open, dated-but-charming RPG.",
    chooseB:
      "You want a smaller, denser world where every quest and location was hand-placed, and you want access to the biggest fantasy mod scene there is.",
    verdict:
      "Daggerfall Unity and OpenMW are both free, actively developed, modern engine ports of classic Elder Scrolls games. Daggerfall is procedurally generated at a scale no other RPG matches; Morrowind is smaller but entirely hand-crafted, with a much larger mod ecosystem. Neither costs anything, since both require only the freely available original game data.",
  },
  {
    slug: "daggerfall-vs-tes-arena",
    aSlug: "daggerfall",
    bSlug: "tes-arena",
    title: "Daggerfall vs The Elder Scrolls: Arena",
    intro:
      "Arena is where the series started in 1994; Daggerfall is its 1996 sequel and the point where the series' identity — huge procedural worlds — actually took shape. Arena is worth playing for history; Daggerfall is worth playing on its own merits.",
    rows: [
      { aspect: "Release", a: "1994", b: "1996" },
      { aspect: "Download size", a: "~40 MB", b: "~500 MB" },
      { aspect: "World structure", a: "A continent of disconnected dungeon crawls and towns", b: "A single vast, continuous, procedurally generated province" },
      { aspect: "Faction/guild depth", a: "Minimal", b: "Multiple detailed guilds and factions" },
      { aspect: "Engine used here", a: "DOSBox via PlayBound Launcher", b: "Daggerfall Unity, actively maintained" },
      { aspect: "Approachability today", a: "Rough — 1994 UI and design", b: "Far more playable thanks to the Unity rebuild" },
    ],
    chooseA:
      "You want to see exactly where the series started, as a piece of history, and don't mind period-accurate jank.",
    chooseB:
      "You want the game that actually holds up today — Arena's ideas, refined, with a modern engine behind them.",
    verdict:
      "The Elder Scrolls: Arena is the 1994 original, playable free via DOSBox but rough by modern standards. Daggerfall, its 1996 sequel, is the one that actually defined the series and is far more playable today thanks to the actively maintained Daggerfall Unity engine port. Arena is worth it for history; Daggerfall is worth it on its own.",
  },
  {
    slug: "asherons-call-vs-everquest",
    aSlug: "asherons-call",
    bSlug: "everquest",
    title: "Asheron's Call vs EverQuest",
    intro:
      "The two defining 3D MMORPGs of 1999, both kept alive today by fan-run emulator servers rather than an official publisher. They took different approaches to the same new genre — one open-world and skill-based, the other zoned and class-based.",
    rows: [
      { aspect: "Released", a: "1999", b: "1999" },
      { aspect: "World structure", a: "One seamless continuous world", b: "Discrete zones connected by loading screens" },
      { aspect: "Character building", a: "Skill-based, no fixed classes", b: "Fixed class and race combinations" },
      { aspect: "Download size", a: "~2 GB (ACE emulator client)", b: "~12 GB (Project 1999-style servers)" },
      { aspect: "How it's kept alive", a: "ACEmulator open-source server project", b: "Community emulator servers (e.g. Project 1999)" },
      { aspect: "Travel", a: "Portals and recall, no zone walls", b: "Zone lines, often long walks between hubs" },
    ],
    chooseA:
      "You want one continuous open world with no loading screens and a flexible, skill-based character build.",
    chooseB:
      "You want the more influential and widely imitated of the two — the template EverQuest set is what most subsequent MMORPGs, including World of Warcraft, actually copied.",
    verdict:
      "Asheron's Call and EverQuest are both free-to-play-again 1999 MMORPGs kept alive by fan-run emulator servers rather than their original publishers. Asheron's Call is one continuous seamless world with flexible skill-based characters; EverQuest uses zoned areas and fixed classes, and is the more historically influential of the two — most later MMORPGs borrowed its template rather than Asheron's Call's.",
  },
  {
    slug: "final-fantasy-xi-vs-everquest",
    aSlug: "final-fantasy-xi",
    bSlug: "everquest",
    title: "Final Fantasy XI vs EverQuest",
    intro:
      "Two of the hardest, most group-dependent MMORPGs ever released, both from 1999-2002 and both still running today — FFXI officially by Square Enix, EverQuest through fan emulator servers recreating its classic era. If you want an MMO that assumes you'll need other people, this is the actual choice.",
    rows: [
      { aspect: "How it's playable today", a: "Official, continuously run by Square Enix since 2002", b: "Fan emulator servers (official EQ also still runs)" },
      { aspect: "Combat pacing", a: "Slow, heavily role-dependent group combat", b: "Slow, camp-based group grinding" },
      { aspect: "Download size", a: "~16 GB", b: "~12 GB (classic-era server client)" },
      { aspect: "Job/class system", a: "Swap jobs freely on one character", b: "Fixed class per character" },
      { aspect: "Setting", a: "Final Fantasy fantasy universe", b: "Original Norrath fantasy setting" },
      { aspect: "Longevity", a: "One continuously updated live game since 2002", b: "Original client frozen; community recreates old eras" },
    ],
    chooseA:
      "You want the Final Fantasy universe, a job system you can respec anytime, and an MMO Square Enix still actively runs and updates.",
    chooseB:
      "You want the genre's original template — the game that most other MMORPGs, including FFXI itself, borrowed core ideas from.",
    verdict:
      "Final Fantasy XI and EverQuest are both punishing, group-focused MMORPGs from the genre's early, less accessible era. FFXI is still officially operated by Square Enix with a flexible job system; EverQuest's classic era survives through community emulator servers rather than a single official client. Pick FFXI for a maintained live game, EverQuest for the genre's actual historical template.",
  },
  {
    slug: "marathon-vs-marathon-2",
    aSlug: "marathon",
    bSlug: "marathon-2",
    title: "Marathon vs Marathon 2: Durandal",
    intro:
      "Bungie's own trilogy, both playable free today via the open-source Aleph One engine. Marathon 2 is the direct sequel and the one most people mean when they praise the series — but Marathon is where the story, and the format, started.",
    rows: [
      { aspect: "Released", a: "1994", b: "1995" },
      { aspect: "Download size", a: "~220 MB", b: "~260 MB" },
      { aspect: "Level design", a: "More maze-like, less refined", b: "More varied and open, widely considered the series peak" },
      { aspect: "Weapons/enemies", a: "Smaller roster, foundational set", b: "Expanded roster, better pacing" },
      { aspect: "Story role", a: "Introduces the Pfhor invasion and the AI Durandal", b: "Continues immediately after, deeper narrative terminals" },
      { aspect: "Best first pick", a: "If you want the story from the start", b: "If you want the series at its best first" },
    ],
    chooseA:
      "You want to start the trilogy from its actual beginning and see Durandal's arc unfold in order.",
    chooseB:
      "You want the level design most fans consider the series' high point, and you don't mind picking up mid-story (it recaps enough to follow).",
    verdict:
      "Marathon and Marathon 2: Durandal are both free via the open-source Aleph One engine and the original Bungie data, released one year apart. Marathon introduces the trilogy's AI-driven story; Marathon 2 refines the level design into what most fans consider the series' peak. Play Marathon first for the story, but Marathon 2 is the one to not skip.",
  },
  {
    slug: "openarena-vs-xonotic",
    aSlug: "openarena",
    bSlug: "xonotic",
    title: "OpenArena vs Xonotic",
    intro:
      "Both are free, open-source descendants of Quake III Arena's engine, and both exist to keep classic arena shooting alive without a Quake license. They diverge on how far they modernised past that shared starting point.",
    rows: [
      { aspect: "Base engine", a: "ioquake3 (Quake III's engine, open-sourced)", b: "DarkPlaces (heavily modified Quake engine)" },
      { aspect: "Movement", a: "Classic Quake III movement", b: "Faster, more technical — strafe-jumping, bunny-hopping" },
      { aspect: "Download size", a: "~405 MB", b: "~1.1 GB" },
      { aspect: "Visuals", a: "Closer to original Quake III era assets", b: "Fully original, more modern art and effects" },
      { aspect: "Active development", a: "Slower, maintenance-focused", b: "More active, regular updates" },
      { aspect: "Bot support", a: "Strong, good for offline practice", b: "Strong, good for offline practice" },
    ],
    chooseA:
      "You want the truest continuation of Quake III Arena itself, assets and all, with the least reinvention.",
    chooseB:
      "You want faster, more technical movement and a more actively developed, visually distinct game.",
    verdict:
      "OpenArena and Xonotic both keep classic arena shooting free and alive on open-source engines descended from Quake III. OpenArena stays closer to the original Quake III Arena experience; Xonotic reinvents the movement and visuals into something faster and more its own, with more active ongoing development. Both have strong bots for solo practice.",
  },
  {
    slug: "quake-champions-vs-openarena",
    aSlug: "quake-champions",
    bSlug: "openarena",
    title: "Quake Champions vs OpenArena",
    intro:
      "One is id Software's own free-to-play hero-shooter take on arena combat; the other is a purely community-run, open-source continuation of Quake III itself. The real question is whether you want champions with unique abilities or the unmodified classic formula.",
    rows: [
      { aspect: "Developer", a: "id Software / Bethesda (official, free-to-play)", b: "Community, open-source" },
      { aspect: "Core twist", a: "Champions with unique passive/active abilities", b: "No abilities — pure movement and weapon skill" },
      { aspect: "Download size", a: "~35 GB", b: "~405 MB" },
      { aspect: "Monetisation", a: "Cosmetics and champion unlocks", b: "None — fully free" },
      { aspect: "Player base", a: "Smaller than its shooter peers but official support", b: "Small, dedicated community" },
      { aspect: "Closest lineage", a: "Modernised Quake formula", b: "Direct Quake III Arena continuation" },
    ],
    chooseA:
      "You want an officially maintained, modern arena shooter with unique champion abilities and matchmaking.",
    chooseB:
      "You want the unmodified classic Quake III formula with zero monetisation and a tiny download.",
    verdict:
      "Quake Champions is id Software's own free-to-play arena shooter, adding champion abilities on top of classic Quake movement, with official support and matchmaking. OpenArena is a community, open-source continuation of Quake III Arena itself with no abilities and no monetisation at all. Pick Quake Champions for official support and champions, OpenArena for the unmodified classic formula.",
  },
  {
    slug: "wolfenstein-enemy-territory-vs-team-fortress-2",
    aSlug: "wolfenstein-enemy-territory",
    bSlug: "team-fortress-2",
    title: "Wolfenstein: Enemy Territory vs Team Fortress 2",
    intro:
      "Both are class-based, objective-driven multiplayer shooters that shipped free, and both are still played nearly two decades later. Enemy Territory is the older, more tactical of the two; Team Fortress 2 is the more famous, more stylised one.",
    rows: [
      { aspect: "Released", a: "2003", b: "2007" },
      { aspect: "Tone", a: "Grounded WWII objective combat", b: "Cartoonish, stylised, less realistic" },
      { aspect: "Download size", a: "~300 MB", b: "~25 GB" },
      { aspect: "Classes", a: "6 classes, deep engineer/medic systems", b: "9 classes, more personality-driven design" },
      { aspect: "How it's free", a: "Was released free by id Software from day one", b: "Went free-to-play in 2011, years after launch" },
      { aspect: "Community upkeep", a: "ET: Legacy project maintains it today", b: "Valve still updates it occasionally" },
    ],
    chooseA:
      "You want a more grounded, tactical objective shooter with deep engineer and medic systems, and a smaller download.",
    chooseB:
      "You want the more famous, more actively populated game with more personality, cosmetics, and a huge community item economy.",
    verdict:
      "Wolfenstein: Enemy Territory and Team Fortress 2 are both class-based objective shooters that shipped free, four years apart. Enemy Territory is the more grounded, tactical of the two, kept alive today by the community-run ET: Legacy project. Team Fortress 2 is the more famous, more stylised, far larger download, still occasionally updated by Valve itself.",
  },
  {
    slug: "old-school-runescape-vs-albion-online",
    aSlug: "old-school-runescape",
    bSlug: "albion-online",
    title: "Old School RuneScape vs Albion Online",
    intro:
      "Two skill-based, economy-driven MMOs with no fixed classes, aimed at players who want a real in-game economy rather than a gear-score treadmill. OSRS is a 2013 rollback of a 2007 game; Albion is a modern, cross-platform, full-loot PvP world built from scratch.",
    rows: [
      { aspect: "Released", a: "2013 (recreation of a 2007 build)", b: "2017" },
      { aspect: "Class system", a: "None — skill levels define your character", b: "None — gear defines your role" },
      { aspect: "Download size", a: "~300 MB", b: "~4 GB" },
      { aspect: "PvP stakes", a: "Optional Wilderness, item loss varies", b: "Full-loot PvP is core to the economy" },
      { aspect: "Cross-platform", a: "PC, Android, iOS", b: "PC, Android, iOS with shared servers" },
      { aspect: "Economy focus", a: "Grand Exchange, strong but secondary to skilling", b: "Player-driven economy is the entire premise" },
    ],
    chooseA:
      "You want the deepest, most nostalgic skill-based progression with lower PvP stakes and a huge amount of existing guides and community knowledge.",
    chooseB:
      "You want a full-loot, gear-defined PvP economy where every item in the game was crafted by another player, and true cross-platform play with friends.",
    verdict:
      "Old School RuneScape and Albion Online are both classless, skill- or gear-defined MMOs built around real player economies. OSRS is the nostalgic, lower-stakes option with a decade of guides behind it; Albion Online is built entirely around full-loot PvP and a player-crafted economy, with true cross-platform servers linking PC, Android and iOS.",
  },
  {
    slug: "star-wars-the-old-republic-vs-star-wars-knights-of-the-old-republic",
    aSlug: "star-wars-the-old-republic",
    bSlug: "star-wars-knights-of-the-old-republic",
    title: "Star Wars: The Old Republic vs Knights of the Old Republic",
    intro:
      "SWTOR is the spiritual MMO sequel to KOTOR, set roughly 300 years later in the same conflict between the Republic and the Sith Empire. The choice is really solo, finished RPG versus ongoing, free-to-play MMO with voiced companions.",
    rows: [
      { aspect: "Format", a: "Free-to-play MMORPG, ongoing", b: "Single-player RPG, complete story" },
      { aspect: "Released", a: "2011, still updated", b: "2003, finished" },
      { aspect: "Download size", a: "~75 GB", b: "~5 GB" },
      { aspect: "Story delivery", a: "Fully voiced class stories, MMO structure", b: "Fully voiced single story, no other players" },
      { aspect: "Multiplayer", a: "Full MMO — raids, PvP, guilds", b: "None" },
      { aspect: "Cost to start", a: "Free with a subscription tier for full content", b: "Free (GOG-distributed commercial classic)" },
    ],
    chooseA:
      "You want an ongoing, fully voiced Star Wars MMO with companions, raids and PvP, and don't mind a subscription for full content.",
    chooseB:
      "You want the shorter, complete, single-player story that started the whole Old Republic era — no other players, no subscription.",
    verdict:
      "Star Wars: The Old Republic is BioWare's free-to-play MMO sequel to Knights of the Old Republic, set roughly 300 years later with fully voiced class stories and ongoing live updates. Knights of the Old Republic itself is the finished, single-player original — shorter, free of any MMO structure, and the story SWTOR builds on.",
  },
  {
    slug: "pokemon-blaze-online-vs-pokemmo",
    aSlug: "pokemon-blaze-online",
    bSlug: "pokemmo",
    title: "Pokémon Blaze Online vs PokeMMO",
    intro:
      "Both are unofficial, free, massively multiplayer takes on core-series Pokémon games, run entirely by fan teams. They differ in how much they build beyond the source material versus how faithfully they preserve it.",
    rows: [
      { aspect: "Base content", a: "Original regions and story built for the MMO", b: "Recreations of official Game Boy Advance games" },
      { aspect: "Download size", a: "~666 MB", b: "~260 MB" },
      { aspect: "Client type", a: "Native desktop client", b: "Native desktop client" },
      { aspect: "Trading/co-op", a: "Live trading and co-op battles", b: "Live trading, PvP, guilds" },
      { aspect: "Faithfulness to canon", a: "Original story, not a recreation of any single game", b: "Recreates actual GBA-era Pokémon games faithfully" },
      { aspect: "Regions available", a: "Four original regions", b: "Multiple official generations (Hoenn, Kanto, Unova, etc.)" },
    ],
    chooseA:
      "You want an original story built specifically for multiplayer, rather than a recreation of games you may have already played.",
    chooseB:
      "You want to replay the actual classic Pokémon games you remember, but with live trading, PvP and other players in the same world.",
    verdict:
      "Pokémon Blaze Online and PokeMMO are both free, unofficial, fan-made multiplayer Pokémon games. Blaze Online tells its own original story across four original regions built for multiplayer from scratch. PokeMMO instead faithfully recreates actual classic Game Boy Advance Pokémon games with trading, PvP and guilds layered on top. Pick based on whether you want something new or something familiar.",
  },
  {
    slug: "relic-hunters-zero-remix-vs-holocure",
    aSlug: "relic-hunters-zero-remix",
    bSlug: "holocure",
    title: "Relic Hunters Zero: Remix vs HoloCure",
    intro:
      "Two completely free, no-catch indie games that punch well above their download size — one a couch-co-op twin-stick shooter, the other a solo bullet-heaven roguelite. Both are the kind of free game this catalog exists to find.",
    rows: [
      { aspect: "Genre", a: "Twin-stick shooter, couch co-op", b: "Bullet-heaven roguelite, solo" },
      { aspect: "Multiplayer", a: "Up to 4-player local co-op", b: "Single-player only" },
      { aspect: "Download size", a: "~75 MB", b: "~250 MB" },
      { aspect: "Run structure", a: "Level-based missions, replayable maps", b: "Timed survival runs, escalating waves" },
      { aspect: "Content updates", a: "Finished, stable, occasional patches", b: "Frequent free content updates" },
      { aspect: "Best fit", a: "Couch co-op night with friends", b: "Solo sessions, build experimentation" },
    ],
    chooseA:
      "You want a couch co-op game to play with friends in the same room, no cash shop, no catch.",
    chooseB:
      "You want a solo, endlessly replayable bullet-heaven with frequent free updates and dozens of playable characters.",
    verdict:
      "Relic Hunters Zero: Remix and HoloCure are both completely free indie games with zero monetisation. Relic Hunters Zero is a twin-stick shooter built for local co-op with friends; HoloCure is a solo bullet-heaven roguelite that keeps growing through frequent free updates. Pick based on whether you're playing alone or on the couch.",
  },
  {
    slug: "openciv3-vs-freeciv",
    aSlug: "openciv3",
    bSlug: "freeciv",
    title: "OpenCiv3 vs Freeciv",
    intro:
      "Both are free recreations of Civilization-style 4X strategy, but they picked different targets: OpenCiv3 rebuilds Civilization III specifically, while Freeciv has run its own independent ruleset since 1996, predating Civ III entirely.",
    rows: [
      { aspect: "What it recreates", a: "Civilization III specifically", b: "Its own long-running independent ruleset" },
      { aspect: "First released", a: "2021 (as C7, later renamed)", b: "1996" },
      { aspect: "Download size", a: "~150 MB", b: "~60 MB" },
      { aspect: "Development status", a: "Active, mod-oriented remake project", b: "Continuously developed for nearly 30 years" },
      { aspect: "Modding", a: "Built around modding Civ III's systems", b: "Deep, longstanding ruleset and map modding" },
      { aspect: "Fidelity", a: "Aims to be Civ III, faithfully", b: "Its own game, inspired by the whole series" },
    ],
    chooseA:
      "You specifically want Civilization III's systems and rules, rebuilt and moddable, rather than a general 4X game.",
    chooseB:
      "You want the longer-running, independently balanced 4X game that predates Civ III and has had decades to refine its own rules.",
    verdict:
      "OpenCiv3 and Freeciv are both free, open-source 4X strategy games in the Civilization tradition. OpenCiv3 specifically rebuilds Civilization III as a moddable remake; Freeciv has run its own independent ruleset since 1996, three years before Civ III existed. Pick OpenCiv3 for Civ III fidelity, Freeciv for a longer-refined independent game.",
  },
  {
    slug: "endless-sky-vs-freelancer",
    aSlug: "endless-sky",
    bSlug: "freelancer",
    title: "Endless Sky vs Freelancer",
    intro:
      "Freelancer is the 2003 commercial space-trading classic that defined the genre's story-driven wing; Endless Sky is its closest free spiritual successor, built specifically to fill the gap Freelancer left when its studio closed.",
    rows: [
      { aspect: "Released", a: "2015, still updated", b: "2003, finished (fan-patched for modern systems)" },
      { aspect: "Price", a: "Free, open-source", b: "Free (no longer sold, freely available)" },
      { aspect: "Download size", a: "~450 MB", b: "~1.2 GB" },
      { aspect: "Story", a: "Multiple hand-written campaign arcs", b: "One complete, well-regarded campaign" },
      { aspect: "3D vs 2D", a: "2D, top-down", b: "Full 3D flight and combat" },
      { aspect: "Multiplayer", a: "None", b: "None (official servers long shut down)" },
      { aspect: "Active development", a: "Regular free content updates", b: "None — feature-complete since 2003" },
    ],
    chooseA:
      "You want a still-updated, open-source game receiving new story content, even if it trades 3D flight for 2D.",
    chooseB:
      "You want the original 3D space-sim that defined the genre, complete and polished, even though development stopped in 2003.",
    verdict:
      "Endless Sky and Freelancer are the two most recommended entry points to free space trading and combat. Endless Sky is a 2D, actively developed open-source game with multiple ongoing story campaigns. Freelancer is the finished 2003 3D original that inspired it, no longer sold but freely available and still highly regarded. Endless Sky for ongoing content, Freelancer for the genre-defining 3D original.",
  },
  {
    slug: "the-ur-quan-masters-vs-freelancer",
    aSlug: "the-ur-quan-masters",
    bSlug: "freelancer",
    title: "The Ur-Quan Masters vs Freelancer",
    intro:
      "Two space games with cult followings for very different reasons — The Ur-Quan Masters (Star Control II) for its alien-diplomacy-driven story, Freelancer for its polished 3D trading and combat. Both are free today, decades after release.",
    rows: [
      { aspect: "Released", a: "1992 (open-sourced 2002)", b: "2003" },
      { aspect: "Focus", a: "Story, alien diplomacy, exploration", b: "Trading, missions, 3D combat" },
      { aspect: "Download size", a: "~350 MB", b: "~1.2 GB" },
      { aspect: "Combat style", a: "2D top-down ship-to-ship", b: "Full 3D dogfighting" },
      { aspect: "Tone", a: "Character-driven, often comedic alien races", b: "Grounded, cinematic space opera" },
      { aspect: "Source", a: "GPL-licensed, fully open-source", b: "Freely distributed, source remains closed" },
    ],
    chooseA:
      "You want one of the most acclaimed sci-fi stories in gaming, built around genuinely alien, well-written alien cultures.",
    chooseB:
      "You want modern-feeling 3D flight and combat with a more cinematic, grounded tone.",
    verdict:
      "The Ur-Quan Masters (the open-source release of Star Control II) and Freelancer are both free space games with devoted followings three decades and two years old respectively. The Ur-Quan Masters is prized for its alien-diplomacy story and 2D combat; Freelancer for its polished 3D dogfighting and trading. Pick based on whether story or flight is what you're after.",
  },
  {
    slug: "privateer-gemini-gold-vs-freelancer",
    aSlug: "privateer-gemini-gold",
    bSlug: "freelancer",
    title: "Privateer Gemini Gold vs Freelancer",
    intro:
      "Both descend from Origin Systems' Wing Commander universe, and both are free space-trading games rebuilt or released well after their original studios closed. Privateer Gemini Gold is a fan rebuild of the 1993 original on a modern open-source engine.",
    rows: [
      { aspect: "Source material", a: "Wing Commander: Privateer (1993), rebuilt", b: "Original 2003 game, no rebuild needed" },
      { aspect: "Engine", a: "Vega Strike (open-source)", b: "Original Freelancer engine" },
      { aspect: "Download size", a: "~320 MB", b: "~1.2 GB" },
      { aspect: "Visuals", a: "Modernised 3D ships and resolutions", b: "Original 2003 3D visuals, fan-patched" },
      { aspect: "Fidelity", a: "Faithful rebuild of the Gemini Sector", b: "N/A — it's the original" },
      { aspect: "Story", a: "Wing Commander universe, mercenary trading", b: "Original standalone story" },
    ],
    chooseA:
      "You want the earlier Wing Commander universe game, modernised with 3D ships and current-OS support.",
    chooseB:
      "You want Freelancer's own complete, self-contained story and the more advanced (for its time) engine.",
    verdict:
      "Privateer Gemini Gold rebuilds 1993's Wing Commander: Privateer on the open-source Vega Strike engine with modern resolutions and 3D ships. Freelancer is a later, self-contained 2003 game with its own engine and story, not connected to Wing Commander. Both are free space-trading sims from the same design lineage — pick based on which era's story you want.",
  },
  {
    slug: "stalker-shadow-of-chernobyl-vs-clear-sky",
    aSlug: "s-t-a-l-k-e-r-clear-sky",
    bSlug: "s-t-a-l-k-e-r-shadow-of-chernobyl",
    title: "S.T.A.L.K.E.R.: Clear Sky vs Shadow of Chornobyl",
    intro:
      "Clear Sky is the prequel released a year after Shadow of Chornobyl, adding faction warfare but launching in a rougher state. The series is best played in story order, but Clear Sky's reputation means it's worth knowing what you're getting into first.",
    rows: [
      { aspect: "Story order", a: "Prequel, set before Shadow of Chornobyl", b: "First game chronologically released" },
      { aspect: "Released", a: "2008", b: "2007" },
      { aspect: "Download size", a: "~9 GB", b: "~7 GB" },
      { aspect: "New systems", a: "Faction warfare, dynamic territory control", b: "Established the open-world Zone formula" },
      { aspect: "Launch state", a: "Rougher, needed patches to stabilise", b: "More polished at launch for its time" },
      { aspect: "Reputation", a: "The weakest-regarded of the trilogy", b: "The one most fans recommend starting with" },
    ],
    chooseA:
      "You want the faction-warfare mechanics and are willing to accept the trilogy's roughest entry, patched by the community since.",
    chooseB:
      "You want the game that actually defined the series and is the one most fans recommend starting with.",
    verdict:
      "Clear Sky is Shadow of Chornobyl's 2008 prequel, adding dynamic faction warfare but launching rougher and less polished. Shadow of Chornobyl itself, from 2007, is the game that defined the series' open-world Zone formula and remains the entry most fans recommend starting with, even though Clear Sky comes first in the story.",
  },
  {
    slug: "dota-2-vs-league-of-legends",
    aSlug: "dota-2",
    bSlug: "league-of-legends",
    title: "Dota 2 vs League of Legends",
    intro:
      "The two games that built the MOBA genre from the same original Warcraft III mod community, then diverged hard on complexity and accessibility. This is the single most-asked comparison in the genre, and the honest answer is that they reward different things.",
    rows: [
      { aspect: "Complexity", a: "Deliberately dense — items, mechanics rarely simplified", b: "More accessible, more streamlined over time" },
      { aspect: "Download size", a: "~60 GB", b: "~22 GB" },
      { aspect: "Monetisation", a: "Cosmetics only, all heroes free from day one", b: "Cosmetics plus a champion rotation/unlock system" },
      { aspect: "Map mechanics", a: "Denying, more granular last-hitting, runes", b: "Simplified last-hitting, no denying" },
      { aspect: "Single client vs regions", a: "One unified global client", b: "Regional clients and servers" },
      { aspect: "Spin-off", a: "None official", b: "League of Legends: Wild Rift (mobile/console)" },
    ],
    chooseA:
      "You want every hero unlocked from day one with no exceptions, and you want the deeper, less-simplified version of the genre's mechanics.",
    chooseB:
      "You want the more approachable, more actively evolving game with a mobile/console spin-off and a bigger overall player base.",
    verdict:
      "Dota 2 and League of Legends both grew out of the same Warcraft III custom-map community and remain the two biggest free MOBAs. Dota 2 keeps every hero free from day one and leans into deliberate mechanical density; League of Legends is more accessible, uses a champion rotation system, and extends to mobile and console through Wild Rift. Both are entirely free to play.",
  },
  {
    slug: "valorant-vs-counter-strike-2",
    aSlug: "valorant",
    bSlug: "counter-strike-2",
    title: "VALORANT vs Counter-Strike 2",
    intro:
      "The two dominant free tactical shooters, both round-based and economy-driven, but Valorant adds character abilities on top of CS's pure gunplay. This is the defining choice in the genre right now.",
    rows: [
      { aspect: "Core twist", a: "Agents with unique abilities on top of gunplay", b: "Pure gunplay, no character abilities" },
      { aspect: "Released", a: "2020", b: "2023 (successor to CS:GO, 2012)" },
      { aspect: "Download size", a: "~45 GB", b: "~40 GB" },
      { aspect: "Anti-cheat", a: "Kernel-level Vanguard driver", b: "VAC, no kernel driver" },
      { aspect: "Platform", a: "Windows only (console versions exist)", b: "Windows and Linux" },
      { aspect: "Esports scene", a: "Large and fast-growing", b: "The genre's longest-running, largest esports scene" },
    ],
    chooseA:
      "You want abilities and utility layered on top of gunplay, and you're comfortable with a kernel-level anti-cheat driver.",
    chooseB:
      "You want the purest gunplay-only tactical shooter with decades of esports history and native Linux support.",
    verdict:
      "VALORANT and Counter-Strike 2 are the two leading free tactical shooters. VALORANT adds unique agent abilities on top of tactical gunplay and runs a kernel-level anti-cheat; Counter-Strike 2 is the latest evolution of the genre's original, purest gunplay-only formula, with the longest-running esports scene and native Linux support. Both are entirely free.",
  },
  {
    slug: "war-thunder-vs-world-of-tanks",
    aSlug: "war-thunder",
    bSlug: "world-of-tanks",
    title: "War Thunder vs World of Tanks",
    intro:
      "Both are free vehicular combat MMOs built around historical armour, but they diverge sharply on realism versus arcade accessibility — War Thunder spans planes, tanks and ships together with a full realism mode; World of Tanks is tanks-only and stays more arcade throughout.",
    rows: [
      { aspect: "Vehicle types", a: "Tanks, planes and ships in one game", b: "Tanks only" },
      { aspect: "Realism options", a: "Arcade through full Simulator mode", b: "Arcade only, no full-sim mode" },
      { aspect: "Download size", a: "~55 GB", b: "~50 GB" },
      { aspect: "Combined arms", a: "Air and ground can share the same battle", b: "Ground combat only" },
      { aspect: "Damage model", a: "Detailed component/crew damage", b: "Simplified hit-point based damage" },
      { aspect: "Released", a: "2012", b: "2010" },
    ],
    chooseA:
      "You want combined air, ground and naval combat with an optional full-realism simulator mode.",
    chooseB:
      "You want a more arcade, tanks-only experience that's easier to pick up without a realism-mode learning curve.",
    verdict:
      "War Thunder and World of Tanks are the two largest free vehicular combat MMOs built around historical armour. War Thunder combines tanks, planes and ships in the same battles with a full realism simulator mode; World of Tanks is tanks-only and stays more consistently arcade. Pick War Thunder for combined-arms depth, World of Tanks for a simpler, tanks-focused entry point.",
  },
  {
    slug: "srb2kart-vs-supertuxkart",
    aSlug: "srb2kart",
    bSlug: "supertuxkart",
    title: "SRB2Kart vs SuperTuxKart",
    intro:
      "Two free kart racers built on completely different foundations — SRB2Kart is a total conversion of the Doom-derived Sonic Robo Blast 2 engine, while SuperTuxKart is a purpose-built 3D kart racer from the ground up.",
    rows: [
      { aspect: "Engine origin", a: "Modified Doom engine (via SRB2)", b: "Purpose-built 3D engine (Antarctica/irrlicht-derived)" },
      { aspect: "Cast", a: "Sonic the Hedgehog characters and tracks", b: "Open-source mascots (Tux, SuperTuxKart originals)" },
      { aspect: "Download size", a: "~200 MB", b: "~900 MB" },
      { aspect: "Visual style", a: "2.5D sprites in a 3D-ish space", b: "Fully 3D models and tracks" },
      { aspect: "Multiplayer", a: "Strong online and local multiplayer", b: "Online, split-screen and network play" },
      { aspect: "Mod scene", a: "Large — built on SRB2's long modding history", b: "Large — active add-on and track community" },
    ],
    chooseA:
      "You want a Sonic-themed kart racer with that game's distinctive 2.5D style and speed.",
    chooseB:
      "You want a fully 3D kart racer with a longer overall track record and a broader original cast.",
    verdict:
      "SRB2Kart and SuperTuxKart are both free, community-built kart racers with strong multiplayer and modding scenes. SRB2Kart is a total conversion of the Sonic Robo Blast 2 engine with Sonic's cast and 2.5D visuals in a compact ~200 MB download; SuperTuxKart is a purpose-built, fully 3D racer with its own original mascot cast. Pick based on which style and cast you prefer — both are excellent free kart racers.",
  },
  {
    slug: "privateer-gemini-gold-vs-naev",
    aSlug: "privateer-gemini-gold",
    bSlug: "naev",
    title: "Privateer Gemini Gold vs Naev",
    intro:
      "Both are free space-trading games built on open-source engines by volunteer teams, but Privateer Gemini Gold is a faithful rebuild of a 1993 classic while Naev is an original game built from scratch in the same tradition.",
    rows: [
      { aspect: "Origin", a: "Rebuild of Wing Commander: Privateer (1993)", b: "Original game, not a remake" },
      { aspect: "Engine", a: "Vega Strike", b: "Its own custom engine" },
      { aspect: "Download size", a: "~320 MB", b: "~400 MB" },
      { aspect: "Combat depth", a: "Accessible, closer to the 1993 original", b: "More granular ship outfitting and faction politics" },
      { aspect: "Story", a: "Wing Commander universe mercenary story", b: "Original setting, looser and more emergent" },
      { aspect: "Learning curve", a: "Gentler", b: "Steeper" },
    ],
    chooseA:
      "You want the specific Wing Commander: Privateer story and setting, modernised but faithful to 1993.",
    chooseB:
      "You want a deeper, original outfitting and faction system with no ties to a licensed universe.",
    verdict:
      "Privateer Gemini Gold and Naev are both free, open-source space-trading games from volunteer teams. Privateer Gemini Gold faithfully rebuilds 1993's Wing Commander: Privateer on the Vega Strike engine; Naev is an original game with deeper ship outfitting and faction politics on its own custom engine. Pick Privateer Gemini Gold for the classic story, Naev for original depth.",
  },
  {
    slug: "privateer-gemini-gold-vs-endless-sky",
    aSlug: "privateer-gemini-gold",
    bSlug: "endless-sky",
    title: "Privateer Gemini Gold vs Endless Sky",
    intro:
      "Both descend from the same 1990s Wing Commander/Escape Velocity space-trading tradition, but one rebuilds a specific licensed classic while the other builds an original galaxy from scratch and keeps adding to it.",
    rows: [
      { aspect: "Origin", a: "Rebuild of Wing Commander: Privateer (1993)", b: "Original game, actively updated" },
      { aspect: "Visual style", a: "3D ships on the Vega Strike engine", b: "2D top-down" },
      { aspect: "Download size", a: "~320 MB", b: "~450 MB" },
      { aspect: "Content updates", a: "Stable, maintenance-focused", b: "Regular new campaigns and content" },
      { aspect: "Story", a: "Wing Commander universe mercenary story", b: "Multiple original hand-written campaigns" },
      { aspect: "Best first pick", a: "If you know and want Privateer specifically", b: "If you want the most actively growing option" },
    ],
    chooseA:
      "You specifically want the Wing Commander universe and 3D ship models, faithfully modernised.",
    chooseB:
      "You want the most actively developed option, with new story content added on an ongoing basis.",
    verdict:
      "Privateer Gemini Gold and Endless Sky both continue the 1990s space-trading tradition Wing Commander: Privateer helped define, but Privateer Gemini Gold rebuilds that specific licensed game in 3D, while Endless Sky is an original 2D game that keeps shipping new free content. Pick based on whether you want the classic story or the more actively developed game.",
  },
  {
    slug: "openarena-vs-unvanquished",
    aSlug: "openarena",
    bSlug: "unvanquished",
    title: "OpenArena vs Unvanquished",
    intro:
      "Both are free, open-source shooters descended from id Tech engines, but they point in opposite directions — OpenArena is unmodified classic arena deathmatch, Unvanquished is an ambitious asymmetric FPS/RTS hybrid with no real commercial equivalent.",
    rows: [
      { aspect: "Genre", a: "Classic arena deathmatch (Quake III lineage)", b: "Asymmetric FPS/RTS hybrid" },
      { aspect: "Team structure", a: "Free-for-all or team deathmatch", b: "Humans build bases, aliens evolve" },
      { aspect: "Download size", a: "~405 MB", b: "~850 MB" },
      { aspect: "Coordination needed", a: "None — drop in and play", b: "High — a team that ignores building loses" },
      { aspect: "Bot support", a: "Strong", b: "Limited" },
      { aspect: "Solo viability", a: "Good", b: "Poor — needs populated servers" },
    ],
    chooseA:
      "You want classic, no-frills arena deathmatch you can drop into solo against bots.",
    chooseB:
      "You want something genuinely unlike anything commercial — base building and evolution mechanics inside a team shooter.",
    verdict:
      "OpenArena and Unvanquished are both free, open-source id Tech-descended shooters, but OpenArena is unmodified classic arena deathmatch while Unvanquished is a far more ambitious asymmetric FPS/RTS hybrid. OpenArena works well solo against bots; Unvanquished needs a coordinated team and populated servers to shine.",
  },
  {
    slug: "star-wars-galaxies-vs-star-wars-the-old-republic",
    aSlug: "star-wars-galaxies",
    bSlug: "star-wars-the-old-republic",
    title: "Star Wars Galaxies vs The Old Republic",
    intro:
      "Two very different official Star Wars MMOs, kept alive in very different ways — Galaxies through fan-run emulator servers after SOE shut it down, The Old Republic as an actively updated, officially operated free-to-play game.",
    rows: [
      { aspect: "Official status today", a: "Shut down 2011; runs via fan emulator servers", b: "Officially operated, free-to-play" },
      { aspect: "Character system", a: "Skill-based, no fixed classes, deep player professions", b: "Fixed class and Force alignment stories" },
      { aspect: "Download size", a: "~3.5 GB", b: "~75 GB" },
      { aspect: "Setting era", a: "Original trilogy era", b: "Roughly 3,600 years before the films" },
      { aspect: "Player housing/crafting", a: "Extremely deep — one of the genre's best crafting systems", b: "Present but secondary to story" },
      { aspect: "Voice acting", a: "None (2003-era MMO)", b: "Fully voiced class stories" },
    ],
    chooseA:
      "You want the deepest player-driven economy and profession system the genre has produced, and don't mind it running on fan servers.",
    chooseB:
      "You want an officially maintained, fully voiced MMO with ongoing content updates.",
    verdict:
      "Star Wars Galaxies, shut down in 2011, survives today through dedicated fan emulator servers and is prized for its unmatched player crafting and profession depth. The Old Republic remains officially operated by BioWare/EA as a free-to-play MMO with fully voiced class stories. Pick Galaxies for player-driven depth, The Old Republic for an actively maintained official game.",
  },
  {
    slug: "stalker-call-of-pripyat-vs-clear-sky",
    aSlug: "s-t-a-l-k-e-r-clear-sky",
    bSlug: "s-t-a-l-k-e-r-call-of-pripyat",
    title: "S.T.A.L.K.E.R.: Clear Sky vs Call of Pripyat",
    intro:
      "Clear Sky and Call of Pripyat are the trilogy's prequel and true finale respectively, and the gap in polish between them is the widest in the series — Call of Pripyat is widely considered the most stable and refined S.T.A.L.K.E.R. game GSC ever shipped.",
    rows: [
      { aspect: "Story order", a: "Prequel to Shadow of Chornobyl", b: "Sequel, trilogy finale" },
      { aspect: "Released", a: "2008", b: "2010" },
      { aspect: "Download size", a: "~9 GB", b: "~10 GB" },
      { aspect: "Stability at launch", a: "Rough, needed significant patching", b: "The most polished and stable of the trilogy" },
      { aspect: "New systems", a: "Faction warfare", b: "Refined AI, freeplay structure, better performance" },
      { aspect: "Reputation", a: "Weakest-regarded entry", b: "Best-regarded entry" },
    ],
    chooseA:
      "You're playing the trilogy in story order and want the faction-warfare prequel, accepting its rougher edges.",
    chooseB:
      "You want the most polished, most stable, best-reviewed S.T.A.L.K.E.R. game to start with.",
    verdict:
      "Clear Sky is the 2008 prequel to the S.T.A.L.K.E.R. trilogy, adding faction warfare but launching in the roughest state of the three games. Call of Pripyat, the 2010 finale, is widely regarded as the most polished, stable and refined entry GSC ever released. If you're only playing one, Call of Pripyat is the one most fans recommend.",
  },
  {
    slug: "stalker-anomaly-vs-call-of-pripyat",
    aSlug: "stalker-anomaly",
    bSlug: "s-t-a-l-k-e-r-call-of-pripyat",
    title: "S.T.A.L.K.E.R. Anomaly vs Call of Pripyat",
    intro:
      "Anomaly is a free, standalone community mod built on top of Call of Pripyat's assets, combining all three original maps into one open-world sandbox with vastly overhauled survival systems. It's not a replacement for the original so much as what the series became in the hands of its own community.",
    rows: [
      { aspect: "Format", a: "Free standalone community mod, no base game required", b: "Original commercial GSC Game World release" },
      { aspect: "Maps", a: "All maps from all three original games combined", b: "Call of Pripyat's own maps only" },
      { aspect: "Download size", a: "~30 GB", b: "~10 GB" },
      { aspect: "Survival systems", a: "Deep overhauled hunger, sleep, gear degradation", b: "Original, lighter survival mechanics" },
      { aspect: "Story", a: "Sandbox, no fixed campaign", b: "Full authored campaign" },
      { aspect: "Active development", a: "Actively updated by its community team", b: "Finished, no further updates" },
    ],
    chooseA:
      "You want the deepest, most overhauled sandbox Zone experience, combining every map with heavy survival mechanics, and don't need a fixed story.",
    chooseB:
      "You want the original authored campaign and story that the trilogy actually tells.",
    verdict:
      "S.T.A.L.K.E.R. Anomaly is a free, standalone community mod combining every map from the original trilogy into one sandbox with dramatically deeper survival systems, actively updated by its own team. Call of Pripyat is the original 2010 commercial game with a fixed authored campaign. Anomaly for open-ended sandbox depth, Call of Pripyat for the actual story.",
  },
  {
    slug: "valorant-vs-apex-legends",
    aSlug: "valorant",
    bSlug: "apex-legends",
    title: "VALORANT vs Apex Legends",
    intro:
      "Both are free hero shooters with unique character abilities, but they sit in different sub-genres entirely — Valorant is round-based tactical 5v5, Apex Legends is a battle royale for up to 60 players.",
    rows: [
      { aspect: "Format", a: "Round-based 5v5 tactical shooter", b: "Battle royale, up to 60 players" },
      { aspect: "Economy system", a: "Buy weapons/abilities each round", b: "Loot-based, no round economy" },
      { aspect: "Download size", a: "~45 GB", b: "~75 GB" },
      { aspect: "TTK (time to kill)", a: "Very fast, precision-focused", b: "Slower, more forgiving gunfights" },
      { aspect: "Movement", a: "Grounded, minimal movement tech", b: "Fast — sliding, wall-running, tactical repositioning" },
      { aspect: "Platforms", a: "Windows (console versions exist)", b: "Windows, Linux, PlayStation, Xbox, Switch" },
    ],
    chooseA:
      "You want precise, round-based tactical gunplay with a buy-phase economy and minimal movement tech.",
    chooseB:
      "You want a fast-moving, mobility-heavy battle royale playable across the most platforms.",
    verdict:
      "VALORANT and Apex Legends are both free hero shooters with unique character abilities, but they serve different formats: VALORANT is a precise, round-based 5v5 tactical shooter, Apex Legends is a mobility-heavy 60-player battle royale available on the widest range of platforms. Pick based on tactical rounds versus battle royale.",
  },
  {
    slug: "quake-champions-vs-team-fortress-2",
    aSlug: "quake-champions",
    bSlug: "team-fortress-2",
    title: "Quake Champions vs Team Fortress 2",
    intro:
      "Both are free, class/champion-based shooters from beloved franchises, but Quake Champions keeps the fast, high-skill-ceiling arena tradition while Team Fortress 2 is slower, more objective-focused and far more stylised.",
    rows: [
      { aspect: "Pace", a: "Very fast, high mechanical skill ceiling", b: "Slower, more methodical" },
      { aspect: "Format", a: "1v1 and team arena deathmatch", b: "Objective-based (payload, capture points)" },
      { aspect: "Download size", a: "~35 GB", b: "~25 GB" },
      { aspect: "Character design", a: "Champions with unique passive/active abilities", b: "9 classes with distinct roles and personalities" },
      { aspect: "Tone", a: "Grim, sci-fi/horror", b: "Cartoonish, comedic" },
      { aspect: "Age/support", a: "2017, smaller player base", b: "2007, still occasionally updated by Valve" },
    ],
    chooseA:
      "You want the fastest, highest-skill-ceiling shooter here, closer to classic arena Quake with champion abilities layered on.",
    chooseB:
      "You want a slower, objective-focused, comedic team shooter with a much larger and longer-running community.",
    verdict:
      "Quake Champions and Team Fortress 2 are both free class-based shooters, but Quake Champions is a fast, high-skill arena shooter with a grimmer tone, while Team Fortress 2 is slower, objective-focused, and far more comedic with a much larger, longer-running community. Pick based on pace and tone as much as mechanics.",
  },
  {
    slug: "ur-quan-masters-vs-endless-sky",
    aSlug: "the-ur-quan-masters",
    bSlug: "endless-sky",
    title: "The Ur-Quan Masters vs Endless Sky",
    intro:
      "Star Control II (as The Ur-Quan Masters) is one of the most acclaimed sci-fi stories in gaming, open-sourced in 2002. Endless Sky is a newer, actively developed space game clearly influenced by the same design tradition, with a more modern 2D presentation.",
    rows: [
      { aspect: "Released", a: "1992 (open-sourced 2002)", b: "2015, still updated" },
      { aspect: "Story depth", a: "Legendary alien-diplomacy narrative", b: "Multiple solid hand-written campaigns" },
      { aspect: "Download size", a: "~350 MB", b: "~450 MB" },
      { aspect: "Combat", a: "2D arcade-style ship-to-ship duels", b: "2D top-down fleet combat" },
      { aspect: "Active development", a: "Maintenance mode", b: "Regular free content updates" },
      { aspect: "Tone", a: "Often comedic, deeply characterful aliens", b: "More grounded, varied by campaign" },
    ],
    chooseA:
      "You want one of gaming's most celebrated sci-fi stories, even if development has effectively stopped.",
    chooseB:
      "You want a similar spirit of exploration and trading with active ongoing development and more campaigns being added.",
    verdict:
      "The Ur-Quan Masters (Star Control II) is a legendary, open-sourced 1992 game prized for its alien-diplomacy story, now in maintenance mode. Endless Sky is a newer, actively developed space game in a similar spirit, adding new hand-written campaigns on an ongoing basis. Pick The Ur-Quan Masters for the classic story, Endless Sky for continued fresh content.",
  },
  {
    slug: "bzflag-vs-xonotic",
    aSlug: "bzflag",
    bSlug: "xonotic",
    title: "BZFlag vs Xonotic",
    intro:
      "Both are free, long-running open-source multiplayer shooters, but they're barely the same genre — BZFlag is a top-down tank capture-the-flag game from 1992, Xonotic is a fast first-person arena shooter. The real comparison is about longevity and format, not direct competition.",
    rows: [
      { aspect: "Perspective", a: "Third-person, top-down tank combat", b: "First-person arena shooter" },
      { aspect: "Released", a: "1992", b: "2011" },
      { aspect: "Download size", a: "~30 MB", b: "~1.1 GB" },
      { aspect: "Core mode", a: "Capture the flag, tank-based", b: "Deathmatch, CTF, and more, on foot" },
      { aspect: "Longevity", a: "One of the longest-running free online multiplayer games ever", b: "Established, active since 2011" },
      { aspect: "Learning curve", a: "Simple to learn, skill in positioning", b: "Steep — movement tech matters a lot" },
    ],
    chooseA:
      "You want one of the oldest continuously-running free multiplayer games, with simple tank-based CTF and a tiny 30 MB download.",
    chooseB:
      "You want a fast, technical, first-person arena shooter with modern movement mechanics.",
    verdict:
      "BZFlag and Xonotic are both free and open-source, but they're different genres entirely — BZFlag is tank-based top-down capture the flag running continuously since 1992 in a 30 MB download, while Xonotic is a fast, technical first-person arena shooter. They share a spirit of free, community-run multiplayer more than actual gameplay.",
  },
  {
    slug: "star-wars-the-old-republic-vs-guild-wars-2",
    aSlug: "star-wars-the-old-republic",
    bSlug: "guild-wars-2",
    title: "Star Wars: The Old Republic vs Guild Wars 2",
    intro:
      "Two of the biggest free-to-play MMORPGs not built around a subscription wall, but with very different design philosophies — SWTOR leans on fully voiced class stories, Guild Wars 2 on open-world dynamic events and no mandatory grouping.",
    rows: [
      { aspect: "Story delivery", a: "Fully voiced class stories, one per role", b: "Voiced but more open-world, personal story is lighter" },
      { aspect: "Download size", a: "~75 GB", b: "~80 GB" },
      { aspect: "World design", a: "Instanced planets and story missions", b: "Open, seamless zones with dynamic events" },
      { aspect: "Grouping", a: "Traditional trinity, some solo-friendly content", b: "No trinity requirement, flexible builds" },
      { aspect: "Monetisation", a: "Free with subscription tiers for full access", b: "Buy-to-play expansions, no subscription" },
      { aspect: "Setting", a: "Star Wars universe", b: "Original Tyria fantasy setting" },
    ],
    chooseA:
      "You want Star Wars specifically, with fully voiced class-based stories.",
    chooseB:
      "You want a more open, flexible MMO with no subscription and no fixed trinity roles.",
    verdict:
      "Star Wars: The Old Republic and Guild Wars 2 are both major MMORPGs without a mandatory subscription, but they take different approaches: SWTOR leans on fully voiced, instanced class stories in the Star Wars universe, while Guild Wars 2 offers an open, seamless world with dynamic events and no fixed trinity. Pick based on setting and how much structure you want.",
  },
  {
    slug: "dune-legacy-vs-starcraft",
    aSlug: "dune-legacy",
    bSlug: "starcraft",
    title: "Dune Legacy vs StarCraft",
    intro:
      "Dune II effectively invented the modern RTS in 1992; StarCraft perfected the formula six years later and became the genre's most influential competitive game. Playing both, in order, is basically a tour of how the genre matured.",
    rows: [
      { aspect: "Released", a: "1992 (original Dune II)", b: "1998" },
      { aspect: "Genre role", a: "Codified the base-building RTS formula", b: "Refined it into a genre-defining competitive game" },
      { aspect: "Download size", a: "~45 MB", b: "~8 GB" },
      { aspect: "Factions", a: "Three houses, simpler unit rosters", b: "Three asymmetric races, deep unit interplay" },
      { aspect: "Competitive scene", a: "None", b: "One of the largest esports scenes ever, still active" },
      { aspect: "Complexity", a: "Simple, foundational", b: "Deep — build orders, micro, macro all matter" },
    ],
    chooseA:
      "You want to see the genre's actual starting point, simple and short, with no competitive pressure.",
    chooseB:
      "You want the genre's most refined and competitively significant entry, with an active scene decades later.",
    verdict:
      "Dune Legacy rebuilds Dune II, the 1992 game that codified the RTS formula, in a tiny ~45 MB download. StarCraft, six years later, refined that formula into arguably the most competitively significant RTS ever made, with an esports scene still active today. Play Dune Legacy for genre history, StarCraft for the genre at its most refined.",
  },
  {
    slug: "re-volt-rvgl-vs-trackmania",
    aSlug: "re-volt-rvgl",
    bSlug: "trackmania",
    title: "Re-Volt (RVGL) vs Trackmania",
    intro:
      "Both are arcade racers built around track creativity and community content, but Re-Volt is a 1999 RC-car classic modernised by fans, while Trackmania is a still-live, still-updated stunt-driving platform from Ubisoft's Nadeo studio.",
    rows: [
      { aspect: "Vehicle style", a: "Miniature RC cars", b: "Full-size stunt cars" },
      { aspect: "Origin", a: "1999 commercial game, fan-modernised (RVGL)", b: "Officially live-serviced by Nadeo" },
      { aspect: "Download size", a: "~380 MB", b: "~8 GB" },
      { aspect: "Track creation", a: "Community track editor, long-running scene", b: "Deep, actively used official track editor" },
      { aspect: "Physics", a: "Arcade RC-car handling", b: "Physics-driven stunt driving, big jumps and loops" },
      { aspect: "Active support", a: "Community-maintained (RVGL project)", b: "Officially live-serviced, seasonal content" },
    ],
    chooseA:
      "You want the nostalgic RC-car racer from 1999, kept alive by its own community.",
    chooseB:
      "You want a currently live-serviced, officially supported stunt racer with seasonal content.",
    verdict:
      "Re-Volt (RVGL) is a fan-maintained modernisation of the 1999 miniature RC-car racer, kept alive entirely by its community. Trackmania is Ubisoft/Nadeo's officially live-serviced stunt-driving platform with seasonal content and a deep official track editor. Pick Re-Volt for RC-car nostalgia, Trackmania for an actively supported modern racer.",
  },
  {
    slug: "openhv-vs-openra",
    aSlug: "openhv",
    bSlug: "openra",
    title: "OpenHV vs OpenRA",
    intro:
      "OpenHV is built on the OpenRA engine but tells its own original story rather than recreating a classic — the choice is between an original sci-fi RTS on the engine, or the actual classic Command & Conquer/Red Alert games it also powers.",
    rows: [
      { aspect: "Content", a: "Original sci-fi RTS, not a remake", b: "Recreations of Tiberian Dawn, Red Alert, Dune 2000" },
      { aspect: "Shared engine", a: "Built on the OpenRA engine", b: "The OpenRA engine's own flagship games" },
      { aspect: "Download size", a: "~150 MB", b: "~350 MB" },
      { aspect: "Story origin", a: "Built around unreleased 1990s 'Hard Vacuum' assets", b: "Classic Westwood C&C stories" },
      { aspect: "Community size", a: "Smaller, growing indie community", b: "Large, long-established modding and ladder community" },
      { aspect: "Multiplayer scene", a: "Present but smaller", b: "Active ladder and large map/mod library" },
    ],
    chooseA:
      "You want an original sci-fi RTS story built from unreleased 1990s art, on a proven engine.",
    chooseB:
      "You want the actual classic Command & Conquer and Red Alert games, with the largest community on this engine.",
    verdict:
      "OpenHV and OpenRA share the same open-source RTS engine, but OpenHV tells an original story built around Daniel Cook's unreleased 'Hard Vacuum' assets, while OpenRA recreates the actual classic Command & Conquer, Red Alert and Dune 2000 games with a much larger established community. Pick OpenHV for something new, OpenRA for the classics.",
  },
  {
    slug: "openhv-vs-starcraft",
    aSlug: "openhv",
    bSlug: "starcraft",
    title: "OpenHV vs StarCraft",
    intro:
      "Both are sci-fi real-time strategy games, but OpenHV is a small, free, community-built indie RTS on the OpenRA engine, while StarCraft is the genre's most competitively significant entry with decades of esports history behind it.",
    rows: [
      { aspect: "Scale", a: "Small indie community project", b: "Genre-defining, one of the biggest esports scenes ever" },
      { aspect: "Download size", a: "~150 MB", b: "~8 GB" },
      { aspect: "Factions", a: "Original factions built for the engine", b: "Three deeply asymmetric, iconic races" },
      { aspect: "Competitive depth", a: "Casual, community-focused", b: "Extremely deep — build orders, micro, macro" },
      { aspect: "Price", a: "Completely free", b: "Free (Remastered edition free-to-play)" },
      { aspect: "Community size", a: "Small, growing", b: "Large, still active decades later" },
    ],
    chooseA:
      "You want a small, free, community-made sci-fi RTS with a lighter time investment.",
    chooseB:
      "You want the deepest, most competitively refined RTS ever made, still actively played today.",
    verdict:
      "OpenHV is a small, free, community-built sci-fi RTS on the OpenRA engine, casual and approachable. StarCraft is the genre's most competitively significant game, with build-order and micromanagement depth that supported one of the largest esports scenes in gaming history. Both are free — the difference is scale and competitive depth.",
  },
  {
    slug: "triplea-vs-freeciv",
    aSlug: "triplea",
    bSlug: "freeciv",
    title: "TripleA vs Freeciv",
    intro:
      "Both are free, turn-based strategy platforms with decades of community history, but they serve very different tastes — TripleA is built around historical wargames like Axis & Allies, Freeciv around Civilization-style empire building.",
    rows: [
      { aspect: "Core design", a: "Historical wargame engine (Axis & Allies and others)", b: "Civilization-style 4X empire building" },
      { aspect: "Turn structure", a: "Classic board-wargame turns and combat rolls", b: "City management, tech tree, diplomacy" },
      { aspect: "Download size", a: "~150 MB", b: "~60 MB" },
      { aspect: "Map variety", a: "Huge library of historical and fantasy maps", b: "Random and historical map generation" },
      { aspect: "Multiplayer", a: "Play-by-email and live online", b: "Live online and hotseat" },
      { aspect: "Best fit", a: "Fans of board-game-style wargaming", b: "Fans of empire-building 4X strategy" },
    ],
    chooseA:
      "You want a board-game-style wargame engine with a huge library of historical scenarios.",
    chooseB:
      "You want Civilization-style city and empire management with a tech tree and diplomacy.",
    verdict:
      "TripleA and Freeciv are both free, long-running, community-driven strategy platforms, but they serve different tastes — TripleA recreates historical board wargames like Axis & Allies with a huge scenario library, while Freeciv is a Civilization-style 4X empire builder. Pick based on whether you want wargaming or empire management.",
  },
  {
    slug: "triplea-vs-battle-for-wesnoth",
    aSlug: "triplea",
    bSlug: "battle-for-wesnoth",
    title: "TripleA vs The Battle for Wesnoth",
    intro:
      "Both are free, deeply community-supported turn-based strategy games with huge scenario libraries, but TripleA recreates historical board wargames while Wesnoth is an original fantasy tactics game built specifically for the format.",
    rows: [
      { aspect: "Setting", a: "Historical (WWII and other conflicts)", b: "Original high fantasy" },
      { aspect: "Combat resolution", a: "Dice-roll based, board-wargame style", b: "Fantasy tactics with unit types and terrain bonuses" },
      { aspect: "Download size", a: "~150 MB", b: "~700 MB" },
      { aspect: "Content library", a: "Huge historical and custom map collection", b: "Dozens of official and fan-made campaigns" },
      { aspect: "Story", a: "Minimal — the maps are the content", b: "Strong, many full narrative campaigns" },
      { aspect: "Multiplayer", a: "Play-by-email and live", b: "Live online and hotseat" },
    ],
    chooseA:
      "You want historical wargaming with dice-based resolution and a huge scenario library.",
    chooseB:
      "You want an original fantasy setting with strong narrative campaigns and terrain-based tactics.",
    verdict:
      "TripleA and The Battle for Wesnoth are both free turn-based strategy games with massive community content libraries, but TripleA is built around historical board wargames with dice-based combat, while Wesnoth is an original fantasy tactics game with strong narrative campaigns. Pick based on historical wargaming versus fantasy tactics and story.",
  },
  {
    slug: "rollercoaster-tycoon-vs-openttd",
    aSlug: "rollercoaster-tycoon",
    bSlug: "openttd",
    title: "RollerCoaster Tycoon vs OpenTTD",
    intro:
      "Two classic 1990s tycoon-genre games, both still played today thanks to fan preservation — RollerCoaster Tycoon focuses on building and running a theme park, OpenTTD on building transport networks. Different systems, same era and spirit.",
    rows: [
      { aspect: "Core loop", a: "Design rides and manage a theme park", b: "Build and optimise transport networks" },
      { aspect: "Released", a: "1999", b: "2004 (open-source recreation of 1995's Transport Tycoon)" },
      { aspect: "Download size", a: "~2 GB", b: "~200 MB" },
      { aspect: "Modding", a: "Custom scenarios and rides via community tools", b: "Deep NewGRF modding ecosystem" },
      { aspect: "Complexity", a: "Guest happiness, ride design, park finances", b: "Route planning, cargo economics, pathfinding" },
      { aspect: "Multiplayer", a: "None in the original", b: "Yes — live multiplayer servers" },
    ],
    chooseA:
      "You want to design rides and manage guest happiness in a theme park, alone.",
    chooseB:
      "You want deep transport logistics with live multiplayer and one of the best long-term modding scenes in the genre.",
    verdict:
      "RollerCoaster Tycoon and OpenTTD are both beloved 1990s-era tycoon games still played today. RollerCoaster Tycoon is about designing rides and running a theme park, single-player only; OpenTTD is an open-source recreation of Transport Tycoon with deep NewGRF modding and live multiplayer. Pick based on theme parks versus transport logistics.",
  },
  {
    slug: "stunt-rally-vs-trackmania",
    aSlug: "stunt-rally",
    bSlug: "trackmania",
    title: "Stunt Rally vs Trackmania",
    intro:
      "Both are stunt-driving racers built around track editors and community-made content, but Stunt Rally is a free, open-source community project, while Trackmania is Ubisoft's officially live-serviced commercial platform.",
    rows: [
      { aspect: "License", a: "Free, open-source", b: "Free-to-play with paid club tiers" },
      { aspect: "Download size", a: "~800 MB", b: "~8 GB" },
      { aspect: "Track editor", a: "Community-built, VDrift-based physics", b: "Deep official editor, huge community library" },
      { aspect: "Live support", a: "Community-maintained only", b: "Officially live-serviced, seasonal campaigns" },
      { aspect: "Physics feel", a: "Rally/off-road stunt physics", b: "Arcade stunt driving, big jumps and loops" },
      { aspect: "Community size", a: "Small, dedicated", b: "Large, active esports and content community" },
    ],
    chooseA:
      "You want a completely free, open-source stunt racer with no live-service layer at all.",
    chooseB:
      "You want the officially supported, actively updated platform with seasonal content and a much larger community.",
    verdict:
      "Stunt Rally is a free, open-source stunt-driving racer built around a community track editor and rally-style physics. Trackmania is Ubisoft/Nadeo's officially live-serviced stunt platform with seasonal campaigns and a far larger community. Pick Stunt Rally for a fully free, no-live-service option; Trackmania for ongoing official support.",
  },
  {
    slug: "super-sidekicks-vs-soccer-brawl",
    aSlug: "super-sidekicks",
    bSlug: "soccer-brawl",
    title: "Super Sidekicks vs Soccer Brawl",
    intro:
      "Two Neo Geo arcade soccer classics from the same era, both playable free via MAME-based emulation on PlayBound. Super Sidekicks is the more technical, simulation-leaning of the two; Soccer Brawl is faster and more arcade in feel.",
    rows: [
      { aspect: "Released", a: "1992", b: "1992" },
      { aspect: "Pace", a: "More deliberate, technical dribbling", b: "Faster, more arcade-arcadey action" },
      { aspect: "Download size", a: "~34 MB", b: "~32 MB" },
      { aspect: "Series legacy", a: "Spawned several sequels (Sidekicks 2–4)", b: "One-off, no direct sequels" },
      { aspect: "Player count", a: "Up to 4 players", b: "Up to 2 players" },
      { aspect: "Reputation", a: "The more fondly remembered of the two", b: "A solid but lesser-known contemporary" },
    ],
    chooseA:
      "You want the more technical, longer-running Neo Geo soccer series, with 4-player support.",
    chooseB:
      "You want a faster, more arcade-focused soccer game from the same era.",
    verdict:
      "Super Sidekicks and Soccer Brawl are both 1992 Neo Geo arcade soccer games, free via PlayBound's MAME-based emulation. Super Sidekicks is the more technical and fondly remembered of the two, with 4-player support and several sequels; Soccer Brawl is faster and more purely arcade, and stayed a one-off. Both are quick, quarter-munching classics.",
  },
  {
    slug: "super-sidekicks-vs-ysoccer",
    aSlug: "super-sidekicks",
    bSlug: "ysoccer",
    title: "Super Sidekicks vs YSoccer",
    intro:
      "Two very different eras of free soccer gaming — Super Sidekicks is a 1992 Neo Geo arcade classic, YSoccer a modern open-source continuation of the Sensible World of Soccer top-down tactical tradition.",
    rows: [
      { aspect: "Era", a: "1992 Neo Geo arcade", b: "Modern, actively developed" },
      { aspect: "Perspective", a: "Side-view arcade action", b: "Top-down tactical, SWOS-style" },
      { aspect: "Download size", a: "~34 MB", b: "~80 MB" },
      { aspect: "Depth", a: "Arcade — quick matches, simple controls", b: "Deep tactics editor, league and career modes" },
      { aspect: "Active development", a: "None — preserved arcade classic", b: "Actively developed by its community" },
      { aspect: "Multiplayer", a: "Local, up to 4 players", b: "Online and local" },
    ],
    chooseA:
      "You want a quick, arcade-style soccer game from the genre's golden era.",
    chooseB:
      "You want deep tactical management and career modes in an actively developed modern game.",
    verdict:
      "Super Sidekicks is a preserved 1992 Neo Geo arcade soccer classic, quick and simple. YSoccer is a modern, actively developed open-source successor to Sensible World of Soccer's top-down tactical tradition, with a deep tactics editor and career modes. Pick based on quick arcade fun versus deep tactical management.",
  },
  {
    slug: "baseball-stars-2-vs-super-sidekicks",
    aSlug: "baseball-stars-2",
    bSlug: "super-sidekicks",
    title: "Baseball Stars 2 vs Super Sidekicks",
    intro:
      "Two SNK Neo Geo sports classics from the same 1992 era, one baseball, one soccer, both playable free via PlayBound's emulation. If you're deciding between the two sports rather than comparing mechanics directly, this is what each brings.",
    rows: [
      { aspect: "Sport", a: "Baseball", b: "Soccer" },
      { aspect: "Released", a: "1992", b: "1992" },
      { aspect: "Download size", a: "~45 MB", b: "~34 MB" },
      { aspect: "Team customisation", a: "Deep for its era — player stats and team building", b: "Fixed national teams" },
      { aspect: "Pace", a: "Turn-based innings", b: "Continuous real-time action" },
      { aspect: "Player count", a: "Up to 2 players", b: "Up to 4 players" },
    ],
    chooseA:
      "You want baseball with genuinely deep-for-its-era team and player customisation.",
    chooseB:
      "You want continuous real-time soccer action with up to 4 players.",
    verdict:
      "Baseball Stars 2 and Super Sidekicks are both 1992 SNK Neo Geo sports classics, free via PlayBound's emulation. Baseball Stars 2 stands out for team and player customisation unusually deep for its era; Super Sidekicks offers faster, continuous 4-player soccer action. The choice comes down to which sport you'd rather play.",
  },
  {
    slug: "soccer-brawl-vs-ysoccer",
    aSlug: "soccer-brawl",
    bSlug: "ysoccer",
    title: "Soccer Brawl vs YSoccer",
    intro:
      "Soccer Brawl is a fast 1992 Neo Geo arcade classic; YSoccer is a modern, actively developed open-source spiritual successor to Sensible World of Soccer. Same sport, three decades and a completely different design philosophy apart.",
    rows: [
      { aspect: "Era", a: "1992 Neo Geo arcade", b: "Modern, actively developed" },
      { aspect: "Perspective", a: "Side-view arcade action", b: "Top-down tactical" },
      { aspect: "Download size", a: "~32 MB", b: "~80 MB" },
      { aspect: "Depth", a: "Simple, quick arcade matches", b: "Deep tactics editor, leagues, careers" },
      { aspect: "Active development", a: "None — preserved arcade classic", b: "Actively developed by its community" },
      { aspect: "Multiplayer", a: "Local, up to 2 players", b: "Online and local" },
    ],
    chooseA:
      "You want a quick, side-view arcade soccer brawl from 1992.",
    chooseB:
      "You want deep tactical management in a modern, still-updated soccer game.",
    verdict:
      "Soccer Brawl is a preserved 1992 Neo Geo arcade soccer game, quick and simple. YSoccer is a modern, actively developed open-source successor to the Sensible World of Soccer tradition, with deep tactics and career modes. Pick based on quick arcade fun versus deep tactical management.",
  },
  {
    slug: "x-men-arcade-remake-vs-metal-slug-remake",
    aSlug: "x-men-arcade-remake",
    bSlug: "metal-slug-remake",
    title: "X-Men Arcade Remake vs Metal Slug: Community Remake",
    intro:
      "Two free community remakes of beloved arcade classics — one a Konami beat-'em-up, the other SNK's run-and-gun shooter. Both are labours of love from fan teams rebuilding the originals rather than just emulating them.",
    rows: [
      { aspect: "Genre", a: "Beat-'em-up", b: "Run-and-gun shooter" },
      { aspect: "Original released", a: "1992", b: "1996" },
      { aspect: "Download size", a: "~132 MB", b: "~150 MB" },
      { aspect: "Player count", a: "Up to 6 players (matching the original cabinet)", b: "Up to 2 players" },
      { aspect: "Approach", a: "Faithful remake, modern netcode added", b: "Community remake with expanded content" },
      { aspect: "Original license holder", a: "Marvel/Konami", b: "SNK" },
    ],
    chooseA:
      "You want the classic 6-player beat-'em-up experience, rebuilt with modern online play.",
    chooseB:
      "You want fast run-and-gun action with expanded content beyond the 1996 original.",
    verdict:
      "X-Men Arcade Remake and Metal Slug: Community Remake are both free fan remakes of classic arcade games, rebuilt rather than merely emulated. X-Men supports up to 6-player beat-'em-up co-op matching the original cabinet; Metal Slug is a 2-player run-and-gun shooter with expanded community content. Pick based on genre — brawling versus shooting.",
  },
  {
    slug: "tmnt-rescue-palooza-vs-x-men-arcade-remake",
    aSlug: "tmnt-rescue-palooza",
    bSlug: "x-men-arcade-remake",
    title: "TMNT: Rescue-Palooza! vs X-Men Arcade Remake",
    intro:
      "Two free beat-'em-ups built by fans in tribute to the genre's arcade golden age, one an original game inspired by Turtles in Time, the other a direct remake of the actual 1992 X-Men cabinet.",
    rows: [
      { aspect: "Format", a: "Original fan game, not a direct remake", b: "Direct remake of the 1992 arcade cabinet" },
      { aspect: "Released", a: "2019", b: "2025 (remake), original 1992" },
      { aspect: "Download size", a: "~190 MB", b: "~132 MB" },
      { aspect: "Player count", a: "Up to 4 players", b: "Up to 6 players (matching the original cabinet)" },
      { aspect: "Content", a: "New levels inspired by the TMNT arcade tradition", b: "Faithful to the original 1992 game" },
      { aspect: "License", a: "Fan game, unofficial", b: "Fan remake, unofficial" },
    ],
    chooseA:
      "You want a new, original beat-'em-up built in the spirit of classic Turtles arcade games.",
    chooseB:
      "You want the actual 1992 X-Men cabinet, faithfully remade with up to 6-player co-op.",
    verdict:
      "TMNT: Rescue-Palooza! is an original fan-made beat-'em-up inspired by the genre's arcade golden age, supporting 4-player co-op. X-Men Arcade Remake is a direct, faithful remake of the actual 1992 cabinet with its full 6-player co-op restored. Pick based on wanting something new versus the real classic.",
  },
  {
    slug: "srb2kart-vs-srb2",
    aSlug: "srb2kart",
    bSlug: "srb2",
    title: "SRB2Kart vs Sonic Robo Blast 2",
    intro:
      "SRB2Kart is a total conversion built on top of Sonic Robo Blast 2's own engine — same base game, completely different genre. One is a 3D platformer, the other a kart racer, both free and both starring Sonic's cast.",
    rows: [
      { aspect: "Genre", a: "Kart racer", b: "3D platformer" },
      { aspect: "Engine relationship", a: "Total conversion of SRB2's engine", b: "The original base game" },
      { aspect: "Download size", a: "~200 MB", b: "~200 MB" },
      { aspect: "Multiplayer focus", a: "Built entirely around racing multiplayer", b: "Co-op and competition modes, platforming-first" },
      { aspect: "Content", a: "Kart tracks, items, battle modes", b: "Full Sonic-style levels and zones" },
      { aspect: "Best fit", a: "Racing night with friends", b: "Solo or co-op platforming" },
    ],
    chooseA:
      "You want kart racing with Sonic's cast — items, tracks, battle modes.",
    chooseB:
      "You want the actual 3D Sonic platforming experience the kart game was built on top of.",
    verdict:
      "SRB2Kart is a total conversion of Sonic Robo Blast 2's own engine into a full kart racer, while Sonic Robo Blast 2 itself is the original 3D platformer both games share as their foundation. Pick SRB2Kart for racing with friends, SRB2 for platforming.",
  },
  {
    slug: "flatout-2-vs-trackmania",
    aSlug: "flatout-2",
    bSlug: "trackmania",
    title: "FlatOut 2 vs Trackmania",
    intro:
      "Both are arcade racers built around spectacle, but FlatOut 2 is about destruction-derby carnage and ragdoll physics, while Trackmania is about precision stunt driving and perfecting a lap down to the millisecond.",
    rows: [
      { aspect: "Core appeal", a: "Destruction derby, ragdoll physics, crashes", b: "Precision stunt driving, perfect-lap chasing" },
      { aspect: "Released", a: "2006", b: "2020 (this incarnation), franchise since 2003" },
      { aspect: "Download size", a: "~2.6 GB", b: "~8 GB" },
      { aspect: "Live service", a: "Finished, no ongoing updates", b: "Officially live-serviced, seasonal content" },
      { aspect: "Multiplayer", a: "Local and online races/derbies", b: "Massive live online community" },
      { aspect: "Physics feel", a: "Chaotic, destructible, comedic", b: "Precise, momentum-based, skill-focused" },
    ],
    chooseA:
      "You want chaotic, destructible racing with ragdoll physics and derby modes.",
    chooseB:
      "You want a precision stunt-driving platform with active live seasonal content.",
    verdict:
      "FlatOut 2 is a finished 2006 destruction-derby racer built around chaotic ragdoll physics and crashes. Trackmania is Ubisoft/Nadeo's actively live-serviced precision stunt-driving platform with seasonal content and a large ongoing community. Pick FlatOut 2 for carnage, Trackmania for precision and active support.",
  },
  {
    slug: "opents-vs-openra",
    aSlug: "opents",
    bSlug: "openra",
    title: "OpenTS vs OpenRA",
    intro:
      "Both rebuild classic Westwood Command & Conquer games, but they target different entries — OpenTS specifically reconstructs 1999's Tiberian Sun, while OpenRA covers the earlier Tiberian Dawn, Red Alert and Dune 2000 together.",
    rows: [
      { aspect: "Source game(s)", a: "Command & Conquer: Tiberian Sun specifically", b: "Tiberian Dawn, Red Alert, Dune 2000" },
      { aspect: "Engine", a: "Original bgfx-based standalone rebuild", b: "OpenRA engine" },
      { aspect: "Download size", a: "~15 MB", b: "~350 MB" },
      { aspect: "Maturity", a: "Newer project, 2024", b: "Established since 2010, mature ladder and mods" },
      { aspect: "Netcode", a: "Modern UDP netcode", b: "Established, mature multiplayer" },
      { aspect: "Community size", a: "Small, growing", b: "Large, long-established" },
    ],
    chooseA:
      "You specifically want Tiberian Sun, rebuilt as a lightweight standalone executable.",
    chooseB:
      "You want the earlier C&C games with a much larger, more established community and ladder.",
    verdict:
      "OpenTS reconstructs Command & Conquer: Tiberian Sun specifically as a lightweight standalone executable, while OpenRA covers the earlier Tiberian Dawn, Red Alert and Dune 2000 with a much larger, decade-plus-established community. Pick OpenTS if Tiberian Sun is the game you actually want, OpenRA for the bigger, more mature scene.",
  },
  {
    slug: "opents-vs-warzone-2100",
    aSlug: "opents",
    bSlug: "warzone-2100",
    title: "OpenTS vs Warzone 2100",
    intro:
      "Both rebuild or continue late-1990s sci-fi RTS games, but OpenTS faithfully reconstructs Command & Conquer: Tiberian Sun, while Warzone 2100 has been continuously developed since its own 1999 release with a much deeper unit-design system.",
    rows: [
      { aspect: "Status", a: "Faithful reconstruction of a fixed 1999 game", b: "Continuously developed since 1999" },
      { aspect: "Unit design", a: "Fixed roster from the original game", b: "Design your own units from researched components" },
      { aspect: "Download size", a: "~15 MB", b: "~1.5 GB" },
      { aspect: "Tech tree", a: "Original Tiberian Sun tech tree", b: "Deep, expansive research tree" },
      { aspect: "Community size", a: "Small, growing", b: "Established, long-running" },
      { aspect: "Pace", a: "Classic Command & Conquer pace", b: "Slower, more systems-heavy" },
    ],
    chooseA:
      "You want the fixed, faithful Tiberian Sun experience specifically.",
    chooseB:
      "You want a continuously developed RTS where you design your own units from researched parts.",
    verdict:
      "OpenTS faithfully reconstructs Command & Conquer: Tiberian Sun as a fixed, lightweight standalone game. Warzone 2100, open-sourced from its own 1999 commercial release, has been continuously developed ever since and lets you design your own units from researched components — a much deeper systems-driven RTS. Pick OpenTS for Tiberian Sun specifically, Warzone 2100 for ongoing depth.",
  },
  {
    slug: "star-wars-galactic-battlegrounds-saga-vs-starcraft",
    aSlug: "star-wars-galactic-battlegrounds-saga",
    bSlug: "starcraft",
    title: "Star Wars: Galactic Battlegrounds Saga vs StarCraft",
    intro:
      "Both are late-1990s/2001-era sci-fi RTS games, but Galactic Battlegrounds is built on the Age of Empires II engine with a Star Wars reskin, while StarCraft is a from-the-ground-up original with a much deeper competitive legacy.",
    rows: [
      { aspect: "Engine origin", a: "Age of Empires II engine, Star Wars-themed", b: "Original, purpose-built engine" },
      { aspect: "Released", a: "2001", b: "1998" },
      { aspect: "Download size", a: "~1.2 GB", b: "~8 GB" },
      { aspect: "Faction design", a: "Civilizations mirror Age of Empires II's structure", b: "Three deeply asymmetric, iconic races" },
      { aspect: "Competitive scene", a: "None significant", b: "One of the largest esports scenes ever, still active" },
      { aspect: "License", a: "Star Wars universe", b: "Original setting" },
    ],
    chooseA:
      "You want Star Wars specifically, in an Age of Empires II-style base-building RTS.",
    chooseB:
      "You want the more original, more competitively significant RTS with decades of esports history.",
    verdict:
      "Star Wars: Galactic Battlegrounds Saga applies the Age of Empires II engine and structure to a Star Wars setting. StarCraft is an original, purpose-built RTS with three deeply asymmetric races and one of the largest and longest-running esports scenes in gaming. Pick Galactic Battlegrounds for Star Wars, StarCraft for competitive depth.",
  },
  {
    slug: "hypersomnia-vs-counter-strike-2",
    aSlug: "hypersomnia",
    bSlug: "counter-strike-2",
    title: "Hypersomnia vs Counter-Strike 2",
    intro:
      "Hypersomnia is a small, open-source top-down shooter built with deterministic rollback netcode; Counter-Strike 2 is the genre's largest, longest-running commercial tactical shooter. The comparison is really about scale and ambition versus what a tiny open team can build.",
    rows: [
      { aspect: "Perspective", a: "Top-down 2D", b: "First-person" },
      { aspect: "Developer", a: "Small open-source community (AGPL-3.0)", b: "Valve, one of the largest studios in gaming" },
      { aspect: "Download size", a: "~120 MB", b: "~40 GB" },
      { aspect: "Netcode", a: "Deterministic rollback, built from scratch", b: "Valve's established server-authoritative model" },
      { aspect: "Server hosting", a: "Self-hostable headless dedicated server", b: "Valve matchmaking and community servers" },
      { aspect: "Scene size", a: "Small, dedicated open-source community", b: "One of the largest esports scenes in gaming" },
    ],
    chooseA:
      "You want a tiny, fully open-source top-down shooter with modern rollback netcode you can self-host entirely.",
    chooseB:
      "You want the genre's biggest, most established tactical shooter with a massive esports scene.",
    verdict:
      "Hypersomnia is a small, open-source, AGPL-licensed top-down shooter built entirely in public with deterministic rollback netcode and a self-hostable server. Counter-Strike 2 is Valve's flagship, one of the largest tactical shooters and esports scenes in gaming. Both are free — Hypersomnia for open-source self-hosting, Counter-Strike 2 for scale and scene size.",
  },
  {
    slug: "hypersomnia-vs-valorant",
    aSlug: "hypersomnia",
    bSlug: "valorant",
    title: "Hypersomnia vs VALORANT",
    intro:
      "Hypersomnia is a tiny, fully open-source top-down shooter built by a small community; VALORANT is Riot's polished, ability-based tactical shooter with a kernel-level anti-cheat and a massive esports scene. Scale and ambition are the real story here.",
    rows: [
      { aspect: "Perspective", a: "Top-down 2D", b: "First-person" },
      { aspect: "Developer", a: "Small open-source community (AGPL-3.0)", b: "Riot Games" },
      { aspect: "Download size", a: "~120 MB", b: "~45 GB" },
      { aspect: "Abilities", a: "None — pure gunplay and movement", b: "Agent abilities layered on top of gunplay" },
      { aspect: "Anti-cheat", a: "None built-in", b: "Kernel-level Vanguard driver" },
      { aspect: "Source availability", a: "Fully open-source", b: "Closed-source" },
    ],
    chooseA:
      "You want a completely free, fully open-source top-down shooter with no kernel-level software installed.",
    chooseB:
      "You want a polished, ability-based tactical shooter with a huge active esports scene.",
    verdict:
      "Hypersomnia is a small, fully open-source top-down shooter with deterministic netcode and no anti-cheat driver at all. VALORANT is Riot's polished, ability-based tactical shooter with a kernel-level anti-cheat and one of the largest esports scenes in the genre. Pick Hypersomnia for open-source transparency, VALORANT for polish and scene size.",
  },
  {
    slug: "final-fantasy-xi-vs-asherons-call",
    aSlug: "final-fantasy-xi",
    bSlug: "asherons-call",
    title: "Final Fantasy XI vs Asheron's Call",
    intro:
      "Two demanding, group-focused MMORPGs from the same early-2000s era, one officially maintained by Square Enix since 2002, the other kept alive today through the ACEmulator fan project after its own servers shut down.",
    rows: [
      { aspect: "Official status", a: "Officially operated by Square Enix since 2002", b: "Fan emulator servers (original shut down)" },
      { aspect: "Character system", a: "Flexible job system, swap anytime", b: "Skill-based, no fixed classes" },
      { aspect: "Download size", a: "~16 GB", b: "~2 GB" },
      { aspect: "World structure", a: "Zoned areas connected by loading or travel", b: "One continuous seamless world" },
      { aspect: "Setting", a: "Final Fantasy universe", b: "Original Dereth fantasy setting" },
      { aspect: "Group dependency", a: "Very high, especially at higher levels", b: "High, especially in the open world" },
    ],
    chooseA:
      "You want the Final Fantasy universe with a flexible job system, in an officially maintained live game.",
    chooseB:
      "You want one continuous, seamless open world with flexible skill-based characters, kept alive by a dedicated fan project.",
    verdict:
      "Final Fantasy XI remains an officially operated Square Enix MMORPG with a flexible job system players can respec anytime. Asheron's Call, whose original servers shut down, survives through the ACEmulator fan project and offers one continuous seamless world with skill-based characters. Pick FFXI for official support, Asheron's Call for open-world freedom.",
  },
];

export const comparisonsBySlug = new Map(comparisons.map((c) => [c.slug, c]));

/** Comparisons that feature a given game, for cross-linking from game pages. */
export function comparisonsFeaturing(slug: string): Comparison[] {
  return comparisons.filter((c) => c.aSlug === slug || c.bSlug === slug);
}
