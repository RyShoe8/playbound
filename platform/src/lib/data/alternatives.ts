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
        slug: "quake-champions",
        pitch:
          "Quake Champions is id Software's official free-to-play evolution of Quake III Arena, combining classic rocket jumps, railguns, and lightning guns with distinct champion abilities.",
        differences:
          "Modern hero shooter champion passives and active abilities layered onto traditional arena movement. Officially maintained on Steam with active ranked matchmaking.",
      },
      {
        slug: "unvanquished",
        pitch:
          "Unvanquished pairs first-person shooting with real-time strategy — one team builds a base while the other plays as aliens. Nothing commercial does this.",
        differences: "Team-based FPS/RTS hybrid rather than a pure deathmatch arena. Requires coordination to enjoy fully.",
      },
    ],
    verdict:
      "Xonotic is the best free alternative to Quake and Unreal Tournament: a free, open-source arena shooter with fast movement, classic weapon balance, bot support and active public servers, on Windows, macOS and Linux. Quake Champions provides the official modern evolution with active ranked matchmaking.",
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

  /* ── Second wave ───────────────────────────────────────────────────────
   * Chosen where the catalog already holds a genuinely strong answer and the
   * query has clear buying intent. Every pick below is a published game.
   */
  {
    slug: "civilization",
    commercialGame: "Civilization",
    aliases: ["Civ 6", "Civilization VI", "Civ 7", "Sid Meier's Civilization"],
    title: "Free Alternatives to Civilization",
    intro:
      "Civilization is the genre's namesake and every entry is full price, with the newest ones layering DLC on top. Turn-based 4X is unusually well served by free software, though — one of the options below has been in development longer than most commercial studios have existed.",
    topPick: "freeciv",
    picks: [
      {
        slug: "freeciv",
        pitch:
          "Freeciv is a mature, complete turn-based 4X built on Civilization's rules: settle cities, research a tech tree, manage happiness and win by conquest, science or diplomacy. It has been developed continuously since 1996 and supports both single-player against AI and long multiplayer games.",
        differences:
          "The interface is functional rather than polished, and presentation is nowhere near a modern Civ — no leader animations, no cinematic wonders. Rulesets are configurable to the point of being a hobby in themselves, which is a strength once you are in and a lot to absorb on day one.",
      },
      {
        slug: "openciv3",
        pitch:
          "OpenCiv3 is an open-source re-implementation of Civilization III specifically, aimed at players who think Civ III hit the series' high point.",
        differences:
          "Pre-alpha. It is playable but incomplete, missing late-game systems, and support for loading original Civ III scenarios is unfinished. Treat it as something to watch rather than a full replacement today.",
      },
      {
        slug: "0ad",
        pitch:
          "0 A.D. covers the same ancient-history fantasy at a far higher production standard, if what draws you to Civ is the setting rather than turn-based play.",
        differences:
          "Real-time strategy, not turn-based 4X. No tech victory, no diplomacy layer, no world map spanning millennia — a single battle-focused match instead.",
      },
    ],
    verdict:
      "Freeciv is the best free alternative to Civilization: a complete, actively maintained turn-based 4X with tech trees, multiple victory conditions, AI opponents and multiplayer, free with no purchases of any kind. OpenCiv3 is worth watching if you specifically want Civilization III, but it is still pre-alpha.",
  },
  {
    slug: "microsoft-flight-simulator",
    commercialGame: "Microsoft Flight Simulator",
    aliases: ["MSFS", "MSFS 2024", "X-Plane", "flight sim"],
    title: "Free Alternatives to Microsoft Flight Simulator",
    intro:
      "Serious flight simulation is expensive twice over: the simulator, then the aircraft and scenery add-ons. There is one free simulator with genuine depth, and it has been flying since before Microsoft's current series existed.",
    topPick: "flightgear",
    picks: [
      {
        slug: "flightgear",
        pitch:
          "FlightGear is a full civilian flight simulator with a real flight dynamics engine, worldwide scenery, weather, a large aircraft library and multiplayer. Aircraft systems are modelled deeply enough that checklists and procedures matter.",
        differences:
          "Scenery and cockpit art do not approach modern MSFS, which leans on satellite photogrammetry and streaming. FlightGear's quality varies by aircraft because they are community-contributed — some are studied to switch level, others are rough.",
      },
    ],
    verdict:
      "FlightGear is the best free alternative to Microsoft Flight Simulator: an open-source simulator with a genuine flight dynamics engine, global scenery, weather, multiplayer and a large free aircraft library, on Windows, macOS and Linux. Visual fidelity is well behind MSFS; system depth is not.",
  },
  {
    slug: "world-of-warcraft",
    commercialGame: "World of Warcraft",
    aliases: ["WoW", "MMORPG", "Final Fantasy XIV", "subscription MMO"],
    title: "Free MMO Alternatives to World of Warcraft",
    intro:
      "World of Warcraft still expects a subscription, and its competitors mostly gate the good parts behind one too. These are MMOs you can play properly without paying — not trials, and not free-to-start with a wall at level 20.",
    topPick: "everquest",
    picks: [
      {
        slug: "everquest",
        pitch:
          "EverQuest is the game WoW was reacting to, and it is free to play. Twenty-five years of content, a genuinely social levelling curve, and a choice of official live servers or community-run era servers that recreate specific points in its history.",
        differences:
          "Deliberately slower and harsher than WoW — grouping is expected rather than optional, travel takes real time, and dying costs you. The interface shows its age. Optional All Access unlocks some races and content.",
      },
      {
        slug: "villagers-and-heroes",
        pitch:
          "Villagers & Heroes is a free fantasy MMO with a gentler tone, deep crafting and gathering, and one account shared across PC and mobile.",
        differences:
          "Much smaller world and population than WoW. Leans casual and cosy rather than raid-focused.",
      },
      {
        slug: "veloren",
        pitch:
          "Veloren is an open-source multiplayer voxel RPG — open world, exploration and combat, with no monetisation of any kind because there is no company behind it.",
        differences:
          "Not an MMO in the traditional sense: worlds are community-run servers rather than one persistent shard, and it is still in active development, so expect changes between releases.",
      },
    ],
    verdict:
      "EverQuest is the best free alternative to World of Warcraft: a complete, still-updated MMORPG with decades of content, free to play with no subscription required, and a choice of official or community era servers. Villagers & Heroes suits players wanting something lighter, and Veloren suits anyone who wants an open-source world with no monetisation at all.",
  },
  {
    slug: "destiny-2",
    commercialGame: "Destiny 2",
    aliases: ["looter shooter", "Warframe", "The Division"],
    title: "Free Alternatives to Destiny 2",
    intro:
      "Destiny 2 is free to start but sells its expansions, and the story content behind them is most of the game. The obvious alternative is free the whole way through — including everything the community considers essential.",
    topPick: "warframe",
    picks: [
      {
        slug: "warframe",
        pitch:
          "Warframe is a third-person co-op looter shooter with over a decade of content, all of it earnable in game. Movement is faster and more acrobatic than Destiny's, and every frame and weapon can be built with materials rather than money.",
        differences:
          "The onboarding is famously bewildering — a great deal of systems arrive at once and the story is told out of order. Grind replaces the paywall: what Destiny sells, Warframe asks you to farm.",
      },
      {
        slug: "xonotic",
        pitch:
          "If what you want is the gunplay rather than the loot, Xonotic is a fast arena shooter with no progression systems and no monetisation whatsoever.",
        differences:
          "No loot, no campaign, no persistent character — pure competitive multiplayer.",
      },
    ],
    verdict:
      "Warframe is the best free alternative to Destiny 2: a co-op looter shooter with a decade of content where every weapon and character is earnable in game and no expansion is sold separately. Expect a steep introduction and a lot of farming in place of purchases.",
  },
  {
    slug: "transport-tycoon",
    commercialGame: "Transport Tycoon",
    aliases: ["Transport Tycoon Deluxe", "Railroad Tycoon", "Transport Fever"],
    title: "Free Alternatives to Transport Tycoon",
    intro:
      "Transport Tycoon Deluxe is a 1995 game that people still play daily, largely because of what the community built on top of it. The free option is not an imitation — it is the original game's engine rebuilt and then extended for three decades.",
    topPick: "openttd",
    picks: [
      {
        slug: "openttd",
        pitch:
          "OpenTTD is an open-source rebuild of Transport Tycoon Deluxe with vastly larger maps, better pathfinding, multiplayer, and an in-game content service offering thousands of free vehicle sets, industries and scenarios. It ships with free base graphics, so no original game files are required.",
        differences:
          "Presentation stays deliberately faithful to a 1995 game. The depth is in systems and community content rather than visuals, and the modern Transport Fever games look nothing like it.",
      },
      {
        slug: "mindustry",
        pitch:
          "Mindustry scratches the same logistics itch — routing resources through conveyor networks under pressure — with tower-defence combat layered on.",
        differences:
          "Factory and defence rather than passenger and freight transport. Much faster paced, with enemies attacking your network.",
      },
    ],
    verdict:
      "OpenTTD is the best free alternative to Transport Tycoon: an open-source rebuild of Transport Tycoon Deluxe with bigger maps, multiplayer, an enormous free add-on library and no need for the original game's files.",
  },
  {
    slug: "fire-emblem",
    commercialGame: "Fire Emblem",
    aliases: ["Advance Wars", "tactical RPG", "Fire Emblem Three Houses"],
    title: "Free Alternatives to Fire Emblem",
    intro:
      "Turn-based tactics with a story campaign, units you grow attached to and terrain that decides battles is a Nintendo staple locked to Nintendo hardware. The free alternative has more campaigns than any Fire Emblem game — most of them made by players.",
    topPick: "battle-for-wesnoth",
    picks: [
      {
        slug: "battle-for-wesnoth",
        pitch:
          "The Battle for Wesnoth is a turn-based tactical RPG on hex terrain, with unit promotion, terrain-driven combat, day/night cycles and campaigns that carry veteran units between battles. Beyond its own campaigns, its add-on server hosts hundreds of community campaigns, including several longer than any commercial entry in the genre.",
        differences:
          "Combat is openly probabilistic — every attack shows its hit chance and misses happen — where Fire Emblem softens the maths. Presentation is 2D sprites and portraits rather than animated cutscenes, and there is no social or relationship layer.",
      },
    ],
    verdict:
      "The Battle for Wesnoth is the best free alternative to Fire Emblem: a mature turn-based tactical RPG with unit progression, terrain-driven combat, multiple official campaigns and hundreds of free community campaigns, on Windows, macOS and Linux.",
  },
  {
    slug: "need-for-speed",
    commercialGame: "Need for Speed",
    aliases: ["Forza Horizon", "arcade racing", "The Crew"],
    title: "Free Alternatives to Need for Speed",
    intro:
      "Arcade racing has drifted towards live-service pricing, with cars and passes sold on top of the box price. These two are free — one licensed and slick, one open-source and endlessly customisable.",
    topPick: "asphalt-legends",
    picks: [
      {
        slug: "asphalt-legends",
        pitch:
          "Asphalt Legends is a licensed arcade racer with real manufacturers, spectacular drift-and-boost handling and regular events, free to download and play across PC and mobile.",
        differences:
          "Live-service: progression is built around events and card-based car unlocks, with optional purchases to speed things up. Handling is deliberately arcade — nothing like a simulator.",
      },
      {
        slug: "supertuxkart",
        pitch:
          "SuperTuxKart is a full kart racer with a story mode, split-screen, online multiplayer and a large library of free community tracks and karts.",
        differences:
          "Kart racing with items rather than street racing with licensed cars. Family-friendly rather than a night-time street scene.",
      },
    ],
    verdict:
      "Asphalt Legends is the closest free alternative to Need for Speed: a licensed arcade racer with real cars and no purchase required, though it is structured as a live-service game. SuperTuxKart is the better pick if you would rather have a completely free, open-source racer with no monetisation at all.",
  },
  {
    slug: "mega-man",
    commercialGame: "Mega Man",
    aliases: ["Mega Man 11", "Mega Man Legacy Collection", "Rockman"],
    title: "Free Alternatives to Mega Man",
    intro:
      "Capcom sells Mega Man as collections and one-off modern entries. The free option is a complete original game built in the classic style by someone who clearly knows the series inside out.",
    topPick: "mega-man-unlimited",
    picks: [
      {
        slug: "mega-man-unlimited",
        pitch:
          "Mega Man Unlimited is a full-length fangame in the NES-era mould: eight Robot Masters with original weapons and stages, a fortress run, and pixel art and music produced to a standard that stands beside the official games.",
        differences:
          "Notably harder than most official entries — it is aimed at players who already finished the classic series. Being a fangame, it is unaffiliated with Capcom and receives no official support.",
      },
      {
        slug: "supertux",
        pitch:
          "If you want precise 2D platforming without the run-and-gun, SuperTux is a complete open-source platformer with a full world map and level editor.",
        differences:
          "Jump-and-stomp platforming rather than shooting, and no boss weapon system.",
      },
    ],
    verdict:
      "Mega Man Unlimited is the best free alternative to Mega Man: a complete, free fangame with eight original Robot Masters, their weapons, a full fortress finale and production values close to the official series — though it is markedly harder than Capcom's own entries.",
  },
  {
    slug: "super-smash-bros",
    commercialGame: "Super Smash Bros.",
    aliases: ["Super Smash Bros. Ultimate", "Smash Bros", "Melee", "platform fighter", "MultiVersus"],
    title: "Free Alternatives to Super Smash Bros.",
    intro:
      "Nintendo's platform fighting formula — ring-outs, aerial juggles, stage knockbacks, and chaotic party brawling — has a premier free-to-play counterpart with over 50 characters, rollback netcode, and complete cross-play across every platform.",
    topPick: "brawlhalla",
    picks: [
      {
        slug: "brawlhalla",
        pitch:
          "Brawlhalla is a fast-paced 2D platform fighter with over 50 unique Legends, tight rollback netcode, cross-play across all platforms, and an active competitive esports circuit.",
        differences:
          "Weapon-pickup mechanics where each Legend commands two weapon styles rather than a static single-character kit. Free weekly rotation system with purely cosmetic purchases.",
      },
      {
        slug: "hedgewars",
        pitch:
          "If what you want is the zany party chaos with friends, Hedgewars provides explosive physics-driven team destruction.",
        differences:
          "Turn-based artillery trajectory battles rather than real-time platform fighting.",
      },
      {
        slug: "supertuxkart",
        pitch:
          "For couch party competition with Nintendo-style item brawling, SuperTuxKart offers battle arenas alongside racing.",
        differences:
          "Kart racing and vehicular arena battle rather than platform fighting.",
      },
    ],
    verdict:
      "Brawlhalla is the best free alternative to Super Smash Bros.: a polished, highly competitive 2D platform fighter with full cross-platform multiplayer, rollback netcode, frequent balance updates, and zero pay-to-win mechanics.",
  },
  {
    slug: "sensible-soccer",
    commercialGame: "FIFA & Sensible Soccer",
    aliases: ["FIFA", "EA Sports FC", "Sensible World of Soccer", "SWOS", "Kick Off", "arcade soccer"],
    title: "Free Alternatives to FIFA & Sensible Soccer",
    intro:
      "Modern corporate soccer titles demand full annual purchases and push aggressive card packs. Free alternatives deliver both the instant, legendary 16-bit arcade aftertouch football of the Amiga era and tactical physics-driven squad matches.",
    topPick: "ysoccer",
    picks: [
      {
        slug: "ysoccer",
        pitch:
          "YSoccer is the definitive open-source spiritual successor to Sensible World of Soccer (SWOS), featuring fluid aftertouch curve physics, dynamic weather, custom tactics, and a complete team editor.",
        differences:
          "Retro 2D top-down perspective and fast-paced one-touch controls rather than photorealistic 3D broadcast simulations.",
      },
      {
        slug: "strikers-club",
        pitch:
          "Strikers Club brings third-person physics-based street football with customizable clubs, 11v11 online team formations, and direct manual ball control.",
        differences:
          "Third-person behind-the-player camera and full physics control over each touch rather than top-down bird's-eye management.",
      },
    ],
    verdict:
      "YSoccer is the best free alternative to Sensible Soccer and classic arcade football: an open-source top-down masterpiece with authentic aftertouch ball physics, complete league customization, and 4-player local multiplayer.",
  },
  {
    slug: "bomberman",
    commercialGame: "Super Bomberman",
    aliases: ["Bomberman", "Super Bomberman R", "party game", "grid bomber"],
    title: "Free Alternatives to Super Bomberman",
    intro:
      "Grid-based bomb-dropping multiplayer is one of gaming's greatest couch party experiences. The free option captures the classic 16-bit SNES multiplayer perfection with support for up to 8 simultaneous players.",
    topPick: "mrboom",
    picks: [
      {
        slug: "mrboom",
        pitch:
          "Mr. Boom is an authentic 8-player retro Bomberman tribute featuring explosive power-ups, pushable bombs, jumping mechanics, and full multi-gamepad local and netplay support.",
        differences:
          "Strictly dedicated to classic 2D party battles with zero cash shops, season passes, or 3D camera distractions.",
      },
      {
        slug: "hedgewars",
        pitch:
          "Hedgewars delivers similar turn-based explosive demolition and hilarious player eliminations on destructible 2D terrain.",
        differences:
          "Turn-based artillery aiming rather than real-time grid maze navigation.",
      },
    ],
    verdict:
      "Mr. Boom is the best free alternative to Super Bomberman: an unadulterated 8-player open-source party brawler with native controller support, vibrant pixel art, and classic competitive bomb mechanics.",
  },
  {
    slug: "axis-and-allies",
    commercialGame: "Axis & Allies",
    aliases: ["Hearts of Iron IV", "Risk", "global strategy board game", "turn-based grand strategy"],
    title: "Free Alternatives to Axis & Allies & Hearts of Iron",
    intro:
      "Tabletop grand strategy — moving plastic infantry divisions across continental territories, rolling dice for combat, and coordinating global war production — has an open-source titan with hundreds of community maps.",
    topPick: "triplea",
    picks: [
      {
        slug: "triplea",
        pitch:
          "TripleA is a full-featured turn-based grand strategy engine that faithfully replicates the rules, production economies, and combat dice of Axis & Allies, complete with an in-game downloader offering over 400 historical and fantasy maps.",
        differences:
          "Pure strategy board game mechanics and territory maps rather than real-time 3D simulation.",
      },
      {
        slug: "0ad",
        pitch:
          "0 A.D. lets you command historical civilizations with deep economic management and massive battlefield clashes in real time.",
        differences:
          "Real-time RTS strategy rather than turn-based global theatre management.",
      },
      {
        slug: "mindustry",
        pitch:
          "Mindustry scratches the logistics and supply chain optimization itch across interlocking tactical sectors.",
        differences:
          "Tower defence and automated conveyor resource routing rather than military territorial conquest.",
      },
    ],
    verdict:
      "TripleA is the best free alternative to Axis & Allies: a comprehensive, open-source grand strategy engine with online multiplayer, PBEM play-by-email support, and hundreds of downloadable historical campaigns.",
  },
  {
    slug: "wing-commander-privateer",
    commercialGame: "Wing Commander & Freelancer",
    aliases: ["Privateer", "Star Citizen", "Freelancer", "space trading sim", "space combat sim", "Elite"],
    title: "Free Alternatives to Wing Commander & Freelancer",
    intro:
      "The gritty fantasy of starting with an old scout ship, a handful of credits, and the freedom to trade, hunt bounties, or pirate across a hostile galaxy has a complete, modern 3D open-source remake.",
    topPick: "privateer-gemini-gold",
    picks: [
      {
        slug: "privateer-gemini-gold",
        pitch:
          "Privateer Gemini Gold rebuilds the legendary 1993 Origin Systems classic on the Vega Strike 3D engine with high-resolution graphics, native widescreen support, full base concourses, and the complete Righteous Fire expansion campaign.",
        differences:
          "Faithful preservation of vintage 1990s flight-sim mechanics and storyline progression rather than a modern multiplayer live service.",
      },
      {
        slug: "microsoft-allegiance",
        pitch:
          "Microsoft Allegiance combines direct 3D space dogfighting with real-time fleet strategy, where player pilots take orders from a team commander in tactical multiplayer battles.",
        differences:
          "Team-based competitive multiplayer space combat and base conquest rather than open-ended single-player merchant RPG trading.",
      },
      {
        slug: "endless-sky",
        pitch:
          "Endless Sky provides top-down 2D open-world space trading, fleet building, and branching interstellar political campaigns.",
        differences:
          "Top-down 2D combat rather than first-person 3D cockpit flight.",
      },
      {
        slug: "naev",
        pitch:
          "Naev offers deep top-down 2D space exploration with semi-Newtonian physics, rich lore factions, and complex ship customization.",
        differences:
          "2D top-down perspective rather than 3D cockpit dogfighting.",
      },
    ],
    verdict:
      "Privateer Gemini Gold is the best free alternative to Wing Commander and classic space trading sims: a complete, standalone 3D space adventure with deep ship customization, bounty hunting, merchant contracts, and zero purchase requirement.",
  },
  {
    slug: "sega-rally-colin-mcrae",
    commercialGame: "Sega Rally & Colin McRae",
    aliases: ["Colin McRae Rally", "Sega Rally", "Dirt Rally", "WRC", "time trial rally"],
    title: "Free Alternatives to Sega Rally & Colin McRae",
    intro:
      "Arcade rally driving — sliding across gravel, snow, and sand against strict stage countdown timers with a co-pilot calling sharp turns — is kept alive by lightweight open-source racing engines.",
    topPick: "trigger-rally",
    picks: [
      {
        slug: "trigger-rally",
        pitch:
          "Trigger Rally delivers pure 3D arcade off-road racing with over 100 challenging stages, responsive drift handling across dynamic terrain surfaces, and real-time audio co-pilot calls.",
        differences:
          "Focused purely on checkpoint time-trial challenges and cup events without licensed commercial manufacturer car brands.",
      },
      {
        slug: "supertuxkart",
        pitch:
          "SuperTuxKart offers arcade vehicular drifting across imaginative fantasy tracks with split-screen and online racing.",
        differences:
          "Item-based kart racing rather than natural off-road rally stage driving.",
      },
    ],
    verdict:
      "Trigger Rally is the best free alternative to classic arcade rally racers: a lightweight, 3D off-road time-trial racer with over 100 tracks, authentic terrain friction physics, and zero monetization.",
  },
  {
    slug: "gradius-arcade-shmups",
    commercialGame: "Gradius & R-Type",
    aliases: ["Gradius", "R-Type", "arcade shmup", "side-scrolling shooter", "bullet hell", "Salamander"],
    title: "Free Alternatives to Gradius & Classic Arcade Shoot 'em Ups",
    intro:
      "The golden era of side-scrolling arcade space shooters — collecting power-up capsules, building laser beams, dodging dense bullet curtains, and destroying giant core bosses — is celebrated in faithful modern remakes.",
    topPick: "gradius-remake",
    picks: [
      {
        slug: "gradius-remake",
        pitch:
          "Gradius Remake by Game Endeavor delivers a gorgeous modern 60 FPS tribute with the iconic power-up selection gauge, Vic Viper weaponry, responsive gamepad controls, and explosive retro boss battles.",
        differences:
          "A pure retro arcade experience that requires precision dodging and memorization; does not feature modern rogue-lite progression.",
      },
      {
        slug: "mindustry",
        pitch:
          "Mindustry incorporates intense top-down shooting action against waves of enemy air and ground units alongside base construction.",
        differences:
          "Factory automation and tower defense rather than a linear side-scrolling shoot 'em up stage.",
      },
    ],
    verdict:
      "Gradius Remake is the best free alternative to classic arcade shoot 'em ups: a pristine, responsive side-scrolling shooter with authentic weapon upgrade gauges and thrilling retro boss encounters.",
  },
];

export const alternativesBySlug = new Map(alternativePages.map((p) => [p.slug, p]));
