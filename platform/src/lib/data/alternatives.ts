/**
 * "Free alternatives to <commercial game>" landing pages.
 *
 * High commercial intent, no incumbent: current search results for these
 * queries are Reddit threads. Every entry maps onto games already in the
 * catalog, so no new sourcing is required.
 */

export interface AlternativePick {
  /** Catalog game slug. */
  slug: string;
  /** Why this specific game answers the query. 1–2 sentences. */
  pitch: string;
  /** What the free option does differently — honesty builds citability. */
  differences: string;
}

export interface AlternativePage {
  /** URL slug, e.g. "command-and-conquer". */
  slug: string;
  /** The commercial game being replaced. */
  commercialGame: string;
  /** Other names people search for. */
  aliases: string[];
  /** H1. */
  title: string;
  /** Meta description + intro. */
  intro: string;
  /** The single best answer, called out above the rest. */
  topPick: string;
  picks: AlternativePick[];
  /** Direct answer block, written to be quotable verbatim. */
  verdict: string;
}

export const alternativePages: AlternativePage[] = [
  {
    slug: "command-and-conquer",
    commercialGame: "Command & Conquer",
    aliases: ["Red Alert", "Command and Conquer Remastered", "Tiberian Dawn"],
    title: "Free Alternatives to Command & Conquer",
    intro:
      "The Command & Conquer series is largely abandoned as a live product, and the Remastered Collection still costs money. There is a free option that is not a knock-off but a faithful, actively developed rebuild of the original games — with modern resolutions, proper multiplayer and an active ladder.",
    topPick: "openra",
    picks: [
      {
        slug: "openra",
        pitch:
          "OpenRA rebuilds Tiberian Dawn, Red Alert and Dune 2000 on a modern open-source engine. It is the closest thing to an official continuation of the series.",
        differences:
          "Unit control, pathfinding and build queues are modernised rather than replicated exactly, so long-time players should expect rebalanced skirmishes rather than a pixel-perfect recreation.",
      },
      {
        slug: "warzone-2100",
        pitch:
          "Warzone 2100 was a commercial 1999 RTS that was open-sourced, and it has been in continuous development ever since. Its research tree and unit designer go deeper than anything in C&C.",
        differences:
          "Slower and more systems-heavy than C&C. You design your own units from researched components rather than picking from a fixed roster.",
      },
      {
        slug: "0ad",
        pitch:
          "0 A.D. delivers the same base-build-then-attack rhythm at a much higher production standard, in a historical Bronze Age setting.",
        differences:
          "Historical rather than modern/sci-fi, and considerably slower-paced. Closer to Age of Empires than to Red Alert.",
      },
    ],
    verdict:
      "OpenRA is the best free alternative to Command & Conquer: it is an actively maintained open-source rebuild of Tiberian Dawn, Red Alert and Dune 2000, it is genuinely free with no monetisation, and it has a live multiplayer ladder.",
  },
  {
    slug: "age-of-empires",
    commercialGame: "Age of Empires",
    aliases: ["Age of Empires II", "AoE2", "Age of Empires IV"],
    title: "Free Alternatives to Age of Empires",
    intro:
      "Age of Empires II: Definitive Edition is excellent and it is not free. If you want the villager hum, the resource economy and the massed-army push without paying, one free game targets that formula directly — and it looks considerably better than you would expect.",
    topPick: "0ad",
    picks: [
      {
        slug: "0ad",
        pitch:
          "0 A.D. is a historical RTS built explicitly in the Age of Empires mould: gather, build, tech up, mass an army. Production values rival commercial releases.",
        differences:
          "Still formally in alpha, though it has been comfortably playable for years. Fewer civilisations than AoE2's Definitive Edition, and no ranked matchmaking service.",
      },
      {
        slug: "openra",
        pitch:
          "If what you want is the base-building and army-massing rather than the historical setting, OpenRA delivers the same loop at a much faster tempo.",
        differences:
          "No villagers or gathering economy in the AoE sense — resources come from harvesters and refineries. Sharper, shorter matches.",
      },
      {
        slug: "warzone-2100",
        pitch:
          "Warzone 2100 scratches the tech-tree itch harder than AoE does, with a research system that unlocks hundreds of components.",
        differences: "Futuristic setting, no population of civilian workers, much heavier emphasis on research order.",
      },
    ],
    verdict:
      "0 A.D. is the best free alternative to Age of Empires: a historical real-time strategy game with the same gather-build-tech-attack loop, free and open-source under GPL, with no monetisation of any kind.",
  },
  {
    slug: "supreme-commander",
    commercialGame: "Supreme Commander",
    aliases: ["Total Annihilation", "Planetary Annihilation", "Supreme Commander: Forged Alliance"],
    title: "Free Alternatives to Supreme Commander & Total Annihilation",
    intro:
      "Large-scale commander RTS — thousands of units, streaming economies, strategic zoom — is a small genre with a devoted following. Two free games serve it better than anything currently on sale, and both are built on the same open-source engine lineage as the originals.",
    topPick: "beyond-all-reason",
    picks: [
      {
        slug: "beyond-all-reason",
        pitch:
          "Beyond All Reason is the closest modern successor to Total Annihilation: streaming metal and energy, thousands of units, full strategic zoom, and a large active multiplayer population.",
        differences:
          "Economy management is deliberately more punishing than Supreme Commander's — stalling hurts, and resources are spent at varying ratios to reward economic mastery.",
      },
      {
        slug: "zero-k",
        pitch:
          "Zero-K shares the same engine but diverges from the source material, with unit AI smart enough to command at a general level rather than micromanage.",
        differences:
          "More willing to break with Total Annihilation convention. Commands like 'attack this but keep your distance' mean less clicking and more directing.",
      },
      {
        slug: "warzone-2100",
        pitch:
          "A lighter option with the same strategic-scale feel but a far smaller hardware footprint — it runs on almost anything.",
        differences: "Much smaller unit counts and no strategic zoom. Deeper research, shallower spectacle.",
      },
    ],
    verdict:
      "Beyond All Reason is the best free alternative to Supreme Commander and Total Annihilation: a free, open-source, large-scale commander RTS with thousands of units, strategic zoom and an active multiplayer community. Zero-K is the better pick if you prefer smarter unit AI and less micromanagement.",
  },
  {
    slug: "cities-skylines",
    commercialGame: "Cities: Skylines",
    aliases: ["Transport Tycoon", "SimCity", "Transport Fever"],
    title: "Free Alternatives to Cities: Skylines & Transport Tycoon",
    intro:
      "Network-building simulation — routes, logistics, watching a system you designed slowly come to life — has one outstanding free option, and it has been refined continuously for over two decades.",
    topPick: "openttd",
    picks: [
      {
        slug: "openttd",
        pitch:
          "OpenTTD is an open-source rebuild of Transport Tycoon Deluxe with 25 years of improvements: enormous maps, multiplayer, and a colossal library of add-on content through its in-game download service.",
        differences:
          "Transport networks rather than city zoning. You do not paint residential districts; you connect the towns that already exist and grow them through service.",
      },
      {
        slug: "luanti",
        pitch:
          "If the appeal is building a settlement from nothing, Luanti's voxel sandbox gives you unlimited terrain and hundreds of building-focused game modes.",
        differences: "First-person voxel construction, not top-down management. No simulation of citizens or economy.",
      },
      {
        slug: "mindustry",
        pitch:
          "Mindustry is the logistics half of the appeal distilled: conveyor networks, resource chains and throughput optimisation, with combat pressure on top.",
        differences: "Factory logistics rather than civic simulation, and it is an actively hostile environment — things attack your network.",
      },
    ],
    verdict:
      "OpenTTD is the best free alternative to Cities: Skylines and Transport Tycoon: a free, open-source transport network simulation in continuous development since 2004, with multiplayer and a vast official add-on library.",
  },
  {
    slug: "minecraft",
    commercialGame: "Minecraft",
    aliases: ["Minecraft Java Edition", "Minecraft Bedrock"],
    title: "Free Alternatives to Minecraft",
    intro:
      "Minecraft costs money and there is no free tier beyond a browser demo. The strongest free option is not a clone but a voxel game *engine* with hundreds of distinct games built on it — including several that go well past what vanilla Minecraft offers.",
    topPick: "luanti",
    picks: [
      {
        slug: "luanti",
        pitch:
          "Luanti (formerly Minetest) is a free, open-source voxel engine with a built-in content browser offering hundreds of community game modes. It runs on hardware Minecraft cannot touch and installs in 150 MB.",
        differences:
          "Vanilla Luanti is intentionally sparse — it is a platform, not a finished game. Install a game mode first; the default experience is not representative.",
      },
      {
        slug: "veloren",
        pitch:
          "Veloren takes the voxel world and builds a full action-RPG in it, with procedural terrain, character progression and combat.",
        differences: "Adventure and combat focus rather than free-form building. Much less emphasis on construction.",
      },
      {
        slug: "mindustry",
        pitch:
          "For the automation and redstone-engineering side of Minecraft specifically, Mindustry does that better than Minecraft does.",
        differences: "2D top-down, no exploration or building for its own sake. Pure logistics and defence.",
      },
    ],
    verdict:
      "Luanti is the best free alternative to Minecraft: a free, open-source voxel game engine with hundreds of downloadable game modes, a 150 MB install, and support for low-end hardware. It is a platform rather than a single game, so install a game mode before judging it.",
  },
  {
    slug: "factorio",
    commercialGame: "Factorio",
    aliases: ["Satisfactory", "Shapez"],
    title: "Free Alternatives to Factorio",
    intro:
      "Factorio never goes on sale and never will — the developers have said so. If the conveyor-belt-and-throughput itch needs scratching for free, one game does it genuinely well and adds a combat layer Factorio only gestures at.",
    topPick: "mindustry",
    picks: [
      {
        slug: "mindustry",
        pitch:
          "Mindustry is a factory-building tower defence hybrid: conveyor logistics, resource chains and production ratios, with waves of enemies attacking the network you built. Free, open-source, and around 250 MB.",
        differences:
          "Top-down 2D rather than Factorio's scale, and combat is central rather than incidental. Maps are bounded, so it is a series of optimisation puzzles rather than one endless base.",
      },
      {
        slug: "openttd",
        pitch:
          "For pure logistics optimisation without combat, OpenTTD's transport networks pose the same throughput problems at a much larger scale.",
        differences: "Vehicles and routes rather than belts and assemblers. No crafting or production recipes.",
      },
      {
        slug: "luanti",
        pitch:
          "With automation game modes installed, Luanti offers a first-person take on the same industrial-engineering loop.",
        differences: "Depends entirely on which game mode you install; quality and depth vary.",
      },
    ],
    verdict:
      "Mindustry is the best free alternative to Factorio: a free, open-source factory automation game with conveyor logistics and production chains, plus a tower-defence combat layer. It is roughly a 250 MB download and runs on modest hardware.",
  },
  {
    slug: "worms",
    commercialGame: "Worms",
    aliases: ["Worms Armageddon", "Worms W.M.D", "Scorched Earth"],
    title: "Free Alternatives to Worms",
    intro:
      "Turn-based artillery with silly weapons and destructible terrain is a genre almost entirely defined by one paid series. The free option is a faithful, actively maintained take that has been going since 2004.",
    topPick: "hedgewars",
    picks: [
      {
        slug: "hedgewars",
        pitch:
          "Hedgewars is turn-based artillery with destructible terrain, dozens of absurd weapons, hotseat and online multiplayer, and a 180 MB install. It is the direct free equivalent of Worms.",
        differences:
          "Hedgehogs rather than worms, and a slightly different weapon balance. Presentation is charming but less polished than recent commercial Worms entries.",
      },
      {
        slug: "supertuxkart",
        pitch:
          "For the same living-room competitive energy in a different genre, SuperTuxKart handles local multiplayer chaos just as well.",
        differences: "Kart racing, not artillery. Real-time rather than turn-based.",
      },
    ],
    verdict:
      "Hedgewars is the best free alternative to Worms: free, open-source, turn-based artillery with destructible terrain and both hotseat and online multiplayer, in continuous development since 2004 and about 180 MB to install.",
  },
  {
    slug: "mario-kart",
    commercialGame: "Mario Kart",
    aliases: ["Mario Kart 8", "Crash Team Racing"],
    title: "Free Alternatives to Mario Kart",
    intro:
      "Mario Kart requires Nintendo hardware. The free option runs on any PC, supports split-screen for four players locally, and includes a full campaign plus online racing.",
    topPick: "supertuxkart",
    picks: [
      {
        slug: "supertuxkart",
        pitch:
          "SuperTuxKart is a free, open-source kart racer with power-ups, drifting, local split-screen multiplayer, online racing and a story mode. It is the closest free equivalent to Mario Kart that exists.",
        differences:
          "Open-source mascots rather than Nintendo characters, and handling is slightly floatier. Track design is strong but does not match Nintendo's polish.",
      },
      {
        slug: "hedgewars",
        pitch: "For the same couch-competitive chaos in a turn-based form, Hedgewars is the other great local-multiplayer pick.",
        differences: "Turn-based artillery, not racing.",
      },
    ],
    verdict:
      "SuperTuxKart is the best free alternative to Mario Kart: a free, open-source kart racer with power-ups, four-player local split-screen, online multiplayer and a story mode, available on Windows, macOS and Linux.",
  },
  {
    slug: "quake",
    commercialGame: "Quake & Unreal Tournament",
    aliases: ["Quake III Arena", "Unreal Tournament", "arena shooter"],
    title: "Free Alternatives to Quake & Unreal Tournament",
    intro:
      "Classic arena shooters — rocket jumps, strafe movement, weapon control, no loadouts or progression — barely exist as commercial products any more. The free option is a serious, actively maintained continuation of the form.",
    topPick: "xonotic",
    picks: [
      {
        slug: "xonotic",
        pitch:
          "Xonotic is a free, open-source arena shooter with fast movement mechanics, a full weapon set, bots, and active servers. It is a direct descendant of the Quake III lineage.",
        differences:
          "Movement is faster and more technical than Quake III's, with its own mechanics to learn. Player numbers are far below commercial shooters, though servers are consistently populated.",
      },
      {
        slug: "unvanquished",
        pitch:
          "Unvanquished pairs first-person shooting with real-time strategy — one team builds a base while the other plays as aliens. Nothing commercial does this.",
        differences: "Team-based FPS/RTS hybrid rather than a pure deathmatch arena. Requires coordination to enjoy fully.",
      },
    ],
    verdict:
      "Xonotic is the best free alternative to Quake and Unreal Tournament: a free, open-source arena shooter with fast movement, classic weapon balance, bot support and active public servers, on Windows, macOS and Linux.",
  },
  {
    slug: "diablo",
    commercialGame: "Diablo",
    aliases: ["Diablo IV", "Path of Exile", "Torchlight"],
    title: "Free Alternatives to Diablo",
    intro:
      "Loot, levels and the endless descent. Two free games cover the two halves of the Diablo appeal — the open-world action RPG and the tight, brutal dungeon crawl.",
    topPick: "shattered-pixel-dungeon",
    picks: [
      {
        slug: "shattered-pixel-dungeon",
        pitch:
          "Shattered Pixel Dungeon is a superbly balanced traditional roguelike: item identification, permanent death, deep build variety. Endlessly replayable and tiny to install.",
        differences:
          "Turn-based rather than real-time action, and pixel-art presentation. Permadeath means runs end for good — no gear carries over.",
      },
      {
        slug: "veloren",
        pitch:
          "Veloren is a voxel action RPG with real-time combat, procedural world generation and multiplayer — closer to Diablo's moment-to-moment feel.",
        differences: "Still in active development and the loot economy is less mature. Exploration matters more than itemisation.",
      },
      {
        slug: "battle-for-wesnoth",
        pitch:
          "For the character progression and campaign structure rather than the loot, Battle for Wesnoth offers hundreds of hours of tactical campaigns with units that level up and persist.",
        differences: "Turn-based tactics on a hex grid. No loot at all — progression is through unit advancement.",
      },
    ],
    verdict:
      "Shattered Pixel Dungeon is the best free alternative to Diablo for players who want the loot-and-descend loop, and Veloren is the closer match for real-time action RPG combat. Both are free and open-source with no monetisation.",
  },
  {
    slug: "elite-dangerous",
    commercialGame: "Elite Dangerous",
    aliases: ["Escape Velocity", "Freelancer", "X4", "EVE Online"],
    title: "Free Alternatives to Elite Dangerous",
    intro:
      "Space trading and combat — buy low, sell high, upgrade the ship, pick a side in someone else's war. Two free games do this exceptionally well, and both are far denser with content than their download sizes suggest.",
    topPick: "endless-sky",
    picks: [
      {
        slug: "endless-sky",
        pitch:
          "Endless Sky is a 2D space trading and combat game in the Escape Velocity tradition, with a huge hand-written galaxy, dozens of story arcs and a genuinely open ending. Around 450 MB.",
        differences:
          "Top-down 2D rather than a first-person cockpit. Trading and story are the focus; there is no planetary landing or exploration in the Elite sense.",
      },
      {
        slug: "naev",
        pitch:
          "Naev covers similar ground with a heavier emphasis on ship outfitting and faction politics, and a more granular combat model.",
        differences: "Denser systems and a steeper learning curve. Less narrative direction than Endless Sky.",
      },
    ],
    verdict:
      "Endless Sky is the best free alternative to Elite Dangerous: a free, open-source space trading and combat game with a large hand-authored galaxy and multiple story campaigns, at roughly a 450 MB download. Naev is the better pick if ship outfitting and faction politics interest you more than story.",
  },
  {
    slug: "super-mario-bros",
    commercialGame: "Super Mario Bros.",
    aliases: ["Super Mario World", "New Super Mario Bros"],
    title: "Free Alternatives to Super Mario Bros.",
    intro:
      "Classic 2D platforming — run, jump, collect, precise level design — is locked to Nintendo hardware. The free option is a faithful and complete take that runs anywhere.",
    topPick: "supertux",
    picks: [
      {
        slug: "supertux",
        pitch:
          "SuperTux is a free, open-source 2D side-scrolling platformer built directly in the Super Mario Bros. mould, with a full world map, power-ups and a level editor.",
        differences:
          "Jump physics are close but not identical to Nintendo's, which matters if you are used to frame-perfect Mario movement. Level design is good but less relentlessly inventive.",
      },
      {
        slug: "supertuxkart",
        pitch: "The same character roster in a kart racer, if you want the other half of the Nintendo mascot formula.",
        differences: "Racing rather than platforming.",
      },
    ],
    verdict:
      "SuperTux is the best free alternative to Super Mario Bros.: a free, open-source 2D platformer with a full campaign, world map, power-ups and a built-in level editor, on Windows, macOS and Linux.",
  },
];

export const alternativesBySlug = new Map(alternativePages.map((p) => [p.slug, p]));
