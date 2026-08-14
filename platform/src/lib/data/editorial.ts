import type { Game } from "./types";

/**
 * Editorial depth, kept separate from catalog facts.
 *
 * Facts live in games.ts and change when upstream changes. This file is
 * judgement: the quality assessment, the long-form case, honest limitations.
 * Separating them means a factual import can never silently overwrite writing,
 * and it makes the editorial surface easy to review in one place.
 *
 * IMPORTANT — `qualityBar.activelyMaintained` is a claim with a shelf life.
 * Run `npm run verify:maintenance` to check each game's upstream repository and
 * flag any entry whose `lastVerified` date is stale or whose activity has
 * lapsed. Never hand-edit the flag to true without checking.
 */

/**
 * Where criterion 3 (actively maintained) gets checked.
 *
 * Several projects do not develop on GitHub — 0 A.D. and Xonotic run their own
 * infrastructure, Hedgewars uses Mercurial. For those, a human records the URL
 * they checked and the date. `npm run verify:maintenance` automates the GitHub
 * cases and fails on any manual entry whose check has gone stale, so nothing
 * silently rots.
 */
export type MaintenanceCheck =
  | { kind: "github"; repo: string }
  | { kind: "manual"; url: string; checkedAt: string; note: string };

export type GameEditorial = Pick<
  Game,
  | "qualityBar"
  | "longDescription"
  | "whyWePickedIt"
  | "installSteps"
  | "faq"
  | "bestFor"
  | "notFor"
  | "comparableTo"
> & { maintenanceCheck?: MaintenanceCheck };

const VERIFIED = "2026-07-29";

/**
 * Projects whose maintenance cannot be checked via the catalog's githubRepo.
 * Keyed by slug. Update `checkedAt` whenever you re-verify by hand.
 */
export const maintenanceChecks: Record<string, MaintenanceCheck> = {
  xonotic: {
    kind: "manual",
    url: "https://gitlab.com/xonotic",
    checkedAt: VERIFIED,
    note: "Xonotic develops on its own GitLab instance, not GitHub. Check the xonotic-data and darkplaces repositories for recent commits.",
  },
  "battle-for-wesnoth": {
    kind: "manual",
    url: "https://github.com/wesnoth/wesnoth",
    checkedAt: VERIFIED,
    note: "Upstream is wesnoth/wesnoth on GitHub, which differs from the catalog's githubRepo field. Confirm the repo path before switching this to an automated check.",
  },
  "beyond-all-reason": {
    kind: "manual",
    url: "https://www.beyondallreason.info",
    checkedAt: VERIFIED,
    note: "BAR development is split across several repositories under the beyond-all-reason organisation. Check the game repository and the launcher release feed.",
  },
  "zero-k": {
    kind: "manual",
    url: "https://zero-k.info",
    checkedAt: VERIFIED,
    note: "Zero-K ships continuous updates through its own launcher and Steam rather than tagged GitHub releases. Check the in-game changelog feed.",
  },
  hedgewars: {
    kind: "manual",
    url: "https://hedgewars.org",
    checkedAt: VERIFIED,
    note: "Hedgewars uses Mercurial on its own infrastructure. Check the official download page and changelog for the latest release date.",
  },
  everquest: {
    kind: "manual",
    url: "https://www.everquest.com",
    checkedAt: "2026-08-13",
    note: "Official Live patches through Daybreak LaunchPad. Community editions (Quarm, P99) are maintained on their own sites.",
  },
  flightgear: {
    kind: "manual",
    url: "https://www.flightgear.org",
    checkedAt: "2026-08-13",
    note: "FlightGear publishes numbered releases on flightgear.org rather than a single GitHub repo in the catalog.",
  },
  warframe: {
    kind: "manual",
    url: "https://www.warframe.com",
    checkedAt: "2026-08-13",
    note: "Commercial live-service; check patch notes on warframe.com / Steam, not GitHub.",
  },
  "asphalt-legends": {
    kind: "manual",
    url: "https://store.steampowered.com/app/1815780/Asphalt_Legends/",
    checkedAt: "2026-08-13",
    note: "Gameloft live-service racer; verify the Steam/Epic client is still listed as free to play.",
  },
  "tinywind-pixel-pirate-sailing-game": {
    kind: "manual",
    url: "https://tinywind.io",
    checkedAt: "2026-08-13",
    note: "Browser game with a planned Steam Early Access; confirm tinywind.io still hosts the client.",
  },
  "mega-man-unlimited": {
    kind: "manual",
    url: "https://megaphilx.com/index.php/home/games/mega-man-unlimited/",
    checkedAt: "2026-08-13",
    note: "Finished fangame; confirm the author still hosts the 1.3.1 download.",
  },
};

/** All five criteria met — the common case, since failing one means exclusion. */
function clearsAll(verdict: string): Game["qualityBar"] {
  return {
    genuinelyFree: true,
    finished: true,
    activelyMaintained: true,
    standsAlone: true,
    highQuality: true,
    verdict,
    lastVerified: VERIFIED,
  };
}

export const editorial: Record<string, GameEditorial> = {
  openra: {
    qualityBar: clearsAll(
      "OpenRA clears all five: genuinely free with no monetisation, stable and complete, actively developed, good enough to recommend at full price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Electronic Arts has spent two decades not knowing what to do with Command & Conquer. OpenRA is what happened when volunteers decided to do it properly instead.\n\nIt is not a mod and not an emulator. OpenRA is a from-scratch open-source engine that runs Tiberian Dawn, Red Alert and Dune 2000 with modern resolutions, sane pathfinding, real widescreen support and multiplayer that works without port-forwarding gymnastics. Crucially, it does not simply replicate 1995 — build queues, unit control and production behave the way you always wished they had. Veterans should expect rebalanced skirmishes rather than a pixel-perfect recreation, and that is the point.\n\nEach supported game ships as a separate mod with its own campaign, faction roster and map pool. Red Alert is the most popular starting point; Tiberian Dawn is the purist's choice. Total conversions like Combined Arms mix universes together, and the in-game map browser gives you thousands of community maps without leaving the client.\n\nWhat separates OpenRA from most preservation projects is that it is genuinely alive. There is a competitive ladder with real people on it. Map pools rotate. Balance patches ship. For a franchise whose official custodian released one remaster and went quiet, having an actively maintained, actively played version is remarkable.\n\nAt roughly 350 MB it installs in minutes and runs on essentially any laptop made in the last fifteen years. There is no account requirement, no launcher telemetry and no store.",
    whyWePickedIt:
      "Most classic-RTS revivals are nostalgia projects that stall out at 'technically playable'. OpenRA went the other way — it fixed the things the originals got wrong, kept everything they got right, and then built a competitive scene on top. It is the rare preservation effort that is better than the thing it preserves, and it costs nothing.",
    bestFor: [
      "Anyone who grew up on Command & Conquer or Red Alert",
      "Short, decisive matches rather than hour-long build-ups",
      "Competitive 1v1 with a real ladder and ranking",
      "Old or low-spec laptops — 350 MB and very light on hardware",
      "LAN parties, with no accounts or internet needed",
    ],
    notFor: [
      "You want a pixel-perfect recreation — unit control is deliberately modernised",
      "You prefer slow, economy-heavy strategy; matches here can end in minutes",
      "You want a single-player-only experience, since the community is the main draw",
      "You are looking for modern 3D visuals rather than updated sprite art",
    ],
    comparableTo: ["Command & Conquer", "Red Alert", "Dune 2000", "Tiberian Sun"],
    faq: [
      {
        q: "Is OpenRA free?",
        a: "Yes, completely. OpenRA is open-source under GPL-3.0 with no purchase, subscription, in-game currency or advertising. The original game assets it uses were released as freeware by Electronic Arts, so the whole package is legal and free.",
      },
      {
        q: "Is OpenRA legal?",
        a: "Yes. OpenRA is a clean-room reimplementation of the game engine, and the Command & Conquer and Red Alert assets it downloads were officially released as freeware by Electronic Arts. Nothing is pirated.",
      },
      {
        q: "Which OpenRA mod should I start with?",
        a: "Red Alert. It has the largest player base, the most active ladder and the most familiar faction design. Tiberian Dawn is the closer recreation of the 1995 original if that is what you are after.",
      },
      {
        q: "Does OpenRA have single-player campaigns?",
        a: "Yes. Each mod includes the original campaign missions alongside skirmish mode against AI opponents of varying difficulty. You never need to play online.",
      },
      {
        q: "Is OpenRA still active in 2026?",
        a: "Yes. Development continues, balance patches ship regularly, and the multiplayer ladder has an ongoing population. Live server and player counts are shown on the OpenRA servers page.",
      },
      {
        q: "Can I play OpenRA on Steam Deck?",
        a: "Yes. OpenRA runs on the Steam Deck, though it is a mouse-driven RTS so a trackpad or external mouse gives a much better experience than the sticks.",
      },
      {
        q: "How is OpenRA different from the C&C Remastered Collection?",
        a: "The Remastered Collection is a paid product that upgrades the original graphics while keeping the original engine behaviour. OpenRA is free and rewrites the engine, modernising unit control, pathfinding and multiplayer — a different design philosophy rather than a cheaper version of the same thing.",
      },
    ],
  },

  freedoom: {
    qualityBar: clearsAll(
      "Freedoom clears all five: completely free-software content under the BSD-3-Clause license, two massive standalone campaigns plus deathmatch, powered by the industry-standard GZDoom engine with modern rendering and controls, and fully playable out of the box."
    ),
    longDescription:
      "When id Software open-sourced the classic Doom source code in 1997, they left behind a puzzle: the code was free, but the game data (IWADs containing levels, sounds, music, and sprites) remained proprietary. Freedoom was created to solve that puzzle completely.\n\nFreedoom provides a complete, 100% free-software replacement for Doom's data assets. It includes three distinct games in one package: Freedoom: Phase 1 (four distinct 9-level episodes inspired by classic episodic FPS design), Freedoom: Phase 2 (a massive continuous 32-level campaign), and FreeDM (a dedicated 32-level fast-paced arena deathmatch suite).\n\nOn PlayBound, Freedoom is paired directly with GZDoom, the premier modern source port. This means you don't just get raw 90s pixels — you get uncapped frame rates, widescreen and ultrawide support, true mouselook, dynamic lighting, hardware-accelerated OpenGL/Vulkan rendering, and native controller support without needing any configuration files or command-line setup.\n\nBecause Freedoom matches standard Doom IWAD specifications, it is also a gateway to thirty years of custom community WADs, total conversions, and mods like Brutal Doom, Project Brutality, and thousands of custom level sets.",
    whyWePickedIt:
      "Freedoom proves that legendary fast-paced boomer-shooter gameplay doesn't require commercial game files or grey-market ROM downloads. With GZDoom as the engine, it delivers dozens of hours of relentless demon-slaying and map exploration in a single, perfectly packaged one-click install.",
    bestFor: [
      "Fans of classic 90s shooters like Doom, Quake, Duke Nukem 3D, and Blood",
      "Anyone who wants immediate, blistering 120+ FPS combat with modern mouselook",
      "Players wanting an open platform for playing thousands of free community WADs and mods",
      "Low-spec PCs, modern gaming rigs, and handhelds like the Steam Deck alike",
    ],
    notFor: [
      "Players looking for modern narrative-heavy, cutscene-driven FPS campaigns",
      "Those who dislike mazes, secret rooms, and keycard-hunting progression",
      "Pure id Software purists who exclusively want the original 1993 copyrighted textures",
    ],
    comparableTo: ["Doom", "Doom II", "Quake", "Duke Nukem 3D", "Blood", "Heretic", "Hexen", "DUSK", "Amid Evil"],
    faq: [
      {
        q: "Is Freedoom free and legal?",
        a: "Yes, 100%. All graphics, sound effects, music, and levels in Freedoom were created from scratch by volunteer contributors and released under the permissive BSD 3-Clause license. No proprietary Doom assets are used.",
      },
      {
        q: "What engine does PlayBound use for Freedoom?",
        a: "PlayBound bundles GZDoom, the most advanced and widely supported modern Doom source port. It includes hardware acceleration (OpenGL / Vulkan), true mouselook, dynamic lighting, high resolution support, and controller integration.",
      },
      {
        q: "What is the difference between Phase 1, Phase 2, and FreeDM?",
        a: "Phase 1 contains four 9-level episodes with distinct bosses (similar in structure to The Ultimate Doom). Phase 2 is a single sprawling 32-level campaign with continuous weapon progression (similar to Doom II). FreeDM is a dedicated 32-level multiplayer deathmatch set.",
      },
      {
        q: "Can I play custom community WADs with this install?",
        a: "Yes! Because Freedoom acts as a full replacement IWAD and GZDoom is the host engine, you can drag and drop custom PWADs or mods onto gzdoom.exe to play community maps.",
      },
      {
        q: "Does Freedoom support gamepads and controllers?",
        a: "Yes. GZDoom features native plug-and-play support for Xbox, PlayStation, and generic PC controllers with customizable deadzones and sensitivity in the options menu.",
      },
    ],
  },

  "0ad": {
    qualityBar: {
      genuinelyFree: true,
      // Formally alpha, but continuously playable for years — a technical
      // label, not a statement about completeness in practice.
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "0 A.D. clears all five. It is formally still in alpha, but it has been comfortably playable and content-complete for years, and its production values match commercial historical strategy games that charge full price.",
      lastVerified: VERIFIED,
    },
    longDescription:
      "0 A.D. is the answer to a question people ask constantly and rarely get a good response to: is there a free Age of Empires?\n\nYes, and it looks better than you expect. 0 A.D. is a historical real-time strategy game set between 500 BC and 500 AD, with more than a dozen fully realised civilisations — Athenians, Spartans, Romans, Carthaginians, Persians, Mauryans, Han Chinese and others — each with distinct units, buildings and architectural styles researched from historical sources. The art direction is genuinely impressive: this does not look like a volunteer project, it looks like a game somebody shipped.\n\nMechanically it sits squarely in the Age of Empires tradition. You gather four resources, build an economy on villager labour, advance through three phases of technology, and eventually field an army large enough to break someone's walls. Matches are long. The build-up is the point, and if you found Age of Empires II too slow you will find this slower.\n\nThe multiplayer lobby is functional and populated, though there is no ranked matchmaking service in the way OpenRA has a ladder. Where 0 A.D. genuinely excels is skirmish play against its AI, which is competent enough to be interesting, and the random map generator, which produces varied and playable terrain.\n\nThe honest caveat is the alpha label. Development has been slow and occasionally interrupted, and the project has been in alpha for over a decade. In practice this affects almost nothing — the game is stable and complete enough that the version number is closer to a philosophical position than a warning.",
    whyWePickedIt:
      "There is a specific kind of disappointment in wanting Age of Empires and finding only shallow clones. 0 A.D. is not that. The historical research is real, the art is beautiful, and the economy has the same satisfying rhythm as the game it descends from. It is the most visually accomplished free game we list, and it charges nothing.",
    bestFor: [
      "Anyone who wants Age of Empires without paying for it",
      "Long, methodical matches where the build-up matters most",
      "Skirmish play against competent AI",
      "Players who care about historical detail and architecture",
      "Anyone who wants a free game that does not look free",
    ],
    notFor: [
      "You want fast matches — games here regularly run past an hour",
      "You have limited disk space, since it is a 3 GB install",
      "You want ranked matchmaking, which has no official service",
      "You are troubled by a formal alpha label, even a long-stable one",
    ],
    comparableTo: ["Age of Empires II", "Age of Empires IV", "Rise of Nations", "Empire Earth"],
    faq: [
      {
        q: "Is 0 A.D. free?",
        a: "Yes, entirely. 0 A.D. is open-source under GPL-2.0 with no purchase, subscription or in-game spending of any kind. It is funded by donations to Wildfire Games.",
      },
      {
        q: "Is 0 A.D. finished?",
        a: "It is formally in alpha and has been for over a decade, but it is stable, feature-rich and content-complete in practice. Most players will not encounter anything that feels unfinished. The label reflects the project's own standards rather than the actual play experience.",
      },
      {
        q: "Is 0 A.D. better than Age of Empires II?",
        a: "Age of Empires II: Definitive Edition has more civilisations, a ranked matchmaking service and decades of balance refinement. 0 A.D. has better visuals in places, deeper historical detail, and costs nothing. If you already own AoE2 it remains the more polished competitive game; if you do not, 0 A.D. is a genuine alternative rather than a compromise.",
      },
      {
        q: "How many civilisations does 0 A.D. have?",
        a: "More than a dozen playable civilisations spanning 500 BC to 500 AD, including Athenians, Spartans, Macedonians, Romans, Carthaginians, Persians, Mauryans, Kushites, Gauls, Britons, Iberians, Seleucids, Ptolemies and Han Chinese.",
      },
      {
        q: "Does 0 A.D. have multiplayer?",
        a: "Yes, with an in-game lobby for finding and hosting matches. There is no official ranked ladder, but casual and organised multiplayer both happen regularly.",
      },
      {
        q: "What are 0 A.D.'s system requirements?",
        a: "A 2 GHz dual-core CPU, 4 GB of RAM and an OpenGL 2.1 GPU as a minimum, with roughly 3 GB of disk space. Large late-game battles benefit noticeably from a faster CPU.",
      },
    ],
  },

  "beyond-all-reason": {
    qualityBar: clearsAll(
      "Beyond All Reason clears all five: free with no monetisation, complete and stable, under very active development, competitive with commercial large-scale RTS games, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Total Annihilation came out in 1997 and defined a genre that has been badly served ever since. Supreme Commander tried. Planetary Annihilation tried. Beyond All Reason succeeded, and it is free.\n\nBAR is a large-scale commander RTS: you start with a single engineering unit, build a streaming economy of metal and energy, and escalate to battles involving thousands of units across enormous maps. Full strategic zoom lets you pull back from individual tanks to an icon-level view of the entire theatre, which is the mechanic that makes this scale legible rather than chaotic.\n\nThe economy is the heart of it and it is deliberately unforgiving. Metal and energy stream continuously rather than accumulating in a bank, and stalling either one brings your whole production chain to a halt. Resources are spent at varying ratios depending on what you are building, so mastering the economy is a genuine skill ceiling in its own right — considerably more demanding than Supreme Commander's more forgiving model.\n\nThe multiplayer population is large and, unusually for a free game, growing. Team games of eight versus eight are common and chaotic in the best way. Matchmaking works, there is an active balance team, and the community produces a steady stream of maps.\n\nBAR shares the Recoil engine with Zero-K and much of the same underlying content, which makes the two easy to confuse. The distinction is philosophical: BAR stays close to Total Annihilation and expects you to micromanage, while Zero-K diverges and automates. Neither is better; they reward different instincts.\n\nAt 2.2 GB it is one of the larger installs we list, and it wants a reasonably modern machine when unit counts climb.",
    whyWePickedIt:
      "Very few free games can claim to be the best in their genre outright, paid competition included. This one can. Nothing currently on sale does thousand-unit commander RTS as well as Beyond All Reason does, and the fact that it is free and open-source is almost incidental to the recommendation.",
    bestFor: [
      "Total Annihilation and Supreme Commander veterans",
      "Enormous battles with thousands of units on screen",
      "Large team games — eight versus eight is common",
      "Players who enjoy economy management as a skill in itself",
      "Anyone who wants an active, growing multiplayer community",
    ],
    notFor: [
      "You dislike micromanagement — Zero-K automates far more",
      "You have a slow machine; late-game unit counts are demanding",
      "You want a story campaign, as the focus is overwhelmingly multiplayer",
      "You want a small download, since it is a 2.2 GB install",
    ],
    comparableTo: [
      "Total Annihilation",
      "Supreme Commander",
      "Planetary Annihilation",
      "Sins of a Solar Empire",
    ],
    faq: [
      {
        q: "Is Beyond All Reason free?",
        a: "Yes, entirely free and open-source. There are no purchases, no battle pass, no cosmetics for sale and no advertising. Development is funded by donations.",
      },
      {
        q: "What is the difference between Beyond All Reason and Zero-K?",
        a: "Both run on the Recoil engine and share maps and models. Beyond All Reason stays closer to Total Annihilation, with a more punishing economy and heavier reliance on player micromanagement. Zero-K deliberately diverges, with unit AI smart enough to command at a general level. BAR has the larger current player base; Zero-K has the smaller download and a Steam presence.",
      },
      {
        q: "Does Beyond All Reason have a single-player campaign?",
        a: "There is skirmish play against AI opponents, and the AI is strong enough to be worth practising against, but the game is built around multiplayer. There is no narrative campaign.",
      },
      {
        q: "What are Beyond All Reason's system requirements?",
        a: "A 3 GHz quad-core CPU, 8 GB of RAM and a dedicated GPU are realistic minimums for comfortable play. Large late-game battles are CPU-bound, so a faster processor matters more than a faster graphics card.",
      },
      {
        q: "Is Beyond All Reason on Steam?",
        a: "Beyond All Reason is distributed through its own launcher from the official site. Zero-K, its close relative, is available on Steam.",
      },
      {
        q: "How many players does Beyond All Reason have?",
        a: "It has one of the healthier populations among free open-source games, with team games filling readily at peak hours. Live server and player counts are shown on the Beyond All Reason servers page.",
      },
    ],
  },

  "zero-k": {
    qualityBar: clearsAll(
      "Zero-K clears all five: free with no monetisation, mature and complete, actively maintained, genuinely excellent on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Zero-K asks a question most real-time strategy games avoid: why are you clicking so much?\n\nIt is a large-scale commander RTS built on the same Recoil engine lineage as Beyond All Reason, sharing maps, models and much underlying tech. Where the two part company is philosophy. BAR treats Total Annihilation as scripture. Zero-K treats it as a starting point, and the biggest departure is unit intelligence. Zero-K's units are smart enough to be directed rather than driven — you can order a group to attack a target while keeping their distance, or hold a line, or retreat when damaged, and they will do something sensible without babysitting. The result is a game that scales to enormous battles without turning into an ergonomics test.\n\nThe economy is more forgiving than BAR's. Metal and energy still stream, but stalling is less catastrophic and the game is more willing to let you recover from a mistake. Terrain is deformable, physics genuinely affects projectiles, and the unit roster is large and unusually varied — including a lot of designs with no equivalent anywhere else.\n\nThere is a substantial single-player campaign, which is unusual in this genre and a real advantage over BAR. It works as a long tutorial that gradually introduces the unit roster, and it is enjoyable in its own right.\n\nZero-K is the older sibling here, with a long-established player base and a Steam listing that makes it easier to find and install. At 1.3 GB it is also markedly lighter than BAR.",
    whyWePickedIt:
      "Zero-K is the thinking player's large-scale RTS. Handing over low-level control to competent unit AI sounds like a small change and turns out to be transformative — you spend your attention on strategy instead of on clicking. The single-player campaign is a genuine bonus in a genre that usually ships multiplayer and nothing else.",
    bestFor: [
      "Directing battles rather than micromanaging individual units",
      "Players who want a substantial single-player campaign in an RTS",
      "Anyone who found Supreme Commander's interface exhausting",
      "Physics-driven combat and deformable terrain",
      "A smaller install than Beyond All Reason, with a Steam option",
    ],
    notFor: [
      "You want strict Total Annihilation fidelity — BAR is the closer match",
      "You enjoy micromanagement, since much of it is deliberately automated",
      "You want the largest possible current player base",
      "You dislike a big unit roster; the variety is initially overwhelming",
    ],
    comparableTo: [
      "Total Annihilation",
      "Supreme Commander",
      "Planetary Annihilation",
      "Beyond All Reason",
    ],
    faq: [
      {
        q: "Is Zero-K free?",
        a: "Yes, entirely. Zero-K is free and open-source on both its own launcher and Steam, with no purchases, no cosmetics and no advertising.",
      },
      {
        q: "Is Zero-K or Beyond All Reason better?",
        a: "They serve different tastes. Zero-K has smarter unit AI, a more forgiving economy, a real single-player campaign and a smaller download. Beyond All Reason stays closer to Total Annihilation, demands more micromanagement, and currently has more players. If you have played neither and want less clicking, start with Zero-K.",
      },
      {
        q: "Does Zero-K have a single-player campaign?",
        a: "Yes, a substantial one, which is unusual for this genre. It gradually introduces the unit roster and works well as both a tutorial and a game in its own right.",
      },
      {
        q: "Is Zero-K on Steam?",
        a: "Yes. Zero-K is listed on Steam and is free there, with no paid content of any kind.",
      },
      {
        q: "What are Zero-K's system requirements?",
        a: "A 2.5 GHz quad-core CPU, 4 GB of RAM and a dedicated GPU handle it comfortably. Like most games in this genre, very large battles are CPU-bound.",
      },
    ],
  },

  mindustry: {
    qualityBar: clearsAll(
      "Mindustry clears all five: free with no monetisation on desktop, complete and heavily content-rich, actively developed, easily good enough to sell, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Factorio famously never goes on sale and the developers have said it never will. Mindustry is the answer for everyone who wanted that itch scratched anyway, and it is not a lesser substitute — it adds something Factorio only gestures at.\n\nMindustry is a top-down factory automation game where the factory is under attack. You mine resources, run them along conveyor belts, refine them through production chains and feed the output into turrets, because waves of enemies are coming for the network you just built. That combat pressure changes how you build. In Factorio a messy layout is an aesthetic problem; in Mindustry a messy layout is a defensive liability, because throughput to your guns is what keeps you alive.\n\nMaps are bounded rather than endless, which turns the game into a series of self-contained optimisation puzzles instead of one sprawling megabase. A campaign sector is an evening rather than a month, and that structure suits people who want a defined objective and an ending. The campaign spans dozens of sectors across two planets with distinct resource sets and enemy behaviour.\n\nMultiplayer is genuinely good and free — co-op building on public servers, and a competitive PvP mode where two teams race to out-produce and then destroy each other. There is a built-in mod browser with a large library of community content, including maps, schematics and full overhauls.\n\nAt roughly 250 MB it runs on almost anything, including phones and low-end laptops. The desktop version is entirely free; the mobile store versions are the only place any payment exists.",
    whyWePickedIt:
      "Automation games usually ask for a month of your life. Mindustry gives you the same conveyor-belt satisfaction in evening-sized portions, and then makes you defend what you built — which turns out to be a better idea than it sounds. It is also one of the most polished games we list, free or otherwise.",
    bestFor: [
      "Anyone who wants Factorio's logistics without the price or the time sink",
      "Defined objectives and shorter sessions rather than endless bases",
      "Co-op building with friends, or competitive PvP factory racing",
      "Low-end hardware — around 250 MB and very undemanding",
      "Players who want combat pressure to shape their layouts",
    ],
    notFor: [
      "You want Factorio's scale and endless single world",
      "You dislike combat interrupting your optimisation",
      "You want 3D or first-person building",
      "You want deep crafting recipe trees; Mindustry's are simpler by design",
    ],
    comparableTo: ["Factorio", "Satisfactory", "Shapez", "Dyson Sphere Program"],
    faq: [
      {
        q: "Is Mindustry free?",
        a: "The desktop version on Steam, itch.io and the official site is entirely free and open-source under GPL-3.0, with no purchases or advertising. The iOS and Android store listings are paid, which is the only place money changes hands.",
      },
      {
        q: "Is Mindustry like Factorio?",
        a: "The core loop is very similar — conveyor logistics, resource chains and throughput optimisation. The differences are that Mindustry is top-down 2D, uses bounded maps rather than one endless world, and makes combat central rather than incidental. Sessions are much shorter as a result.",
      },
      {
        q: "Does Mindustry have multiplayer?",
        a: "Yes, both co-op and competitive PvP, on free public servers or your own. Multiplayer costs nothing and requires no account.",
      },
      {
        q: "How big is Mindustry?",
        a: "Around 250 MB, which makes it one of the smaller games in the catalog. It runs comfortably on old laptops and low-end hardware.",
      },
      {
        q: "Is Mindustry good for beginners to automation games?",
        a: "It is one of the better entry points. Bounded maps and a guided campaign introduce concepts gradually, and a failed sector costs you an evening rather than a month of progress.",
      },
      {
        q: "Can I mod Mindustry?",
        a: "Yes. There is a built-in mod browser with a large community library covering maps, schematics, new content and full overhauls, installable without leaving the game.",
      },
    ],
  },

  openttd: {
    qualityBar: clearsAll(
      "OpenTTD clears all five: free with no monetisation, exceptionally complete after two decades of refinement, still actively developed, better than the commercial game it descends from, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "OpenTTD has been in continuous development since 2004. That is not a footnote — it is the whole reason to play it. Very few games of any kind have had twenty-two years of uninterrupted refinement, and it shows in a hundred small places.\n\nThe premise is Transport Tycoon Deluxe: build a transport network of trains, road vehicles, ships and aircraft, connect the towns and industries on the map, and grow a company by moving cargo and passengers profitably. You do not zone residential districts like Cities: Skylines — the towns already exist, and they grow when you serve them well. Signalling, route planning and network throughput are the real game, and they go far deeper than the cheerful presentation suggests.\n\nWhat the open-source rebuild added is enormous. Maps up to 4096 by 4096 tiles. Multiplayer for dozens of simultaneous players. A completely reworked interface. And BaNaNaS, an in-game content service that downloads new vehicle sets, industry chains, AI opponents, town-name generators and scenarios directly into the client — a library so large you could play a different-feeling game every month for a year.\n\nThe honest warning is that OpenTTD is a time sink of unusual severity. The interface is dense, the systems are deep, and 'one more year' is a phrase people say at four in the morning. It is also visually modest by default, though the graphics replacement sets available through BaNaNaS address that if it bothers you.\n\nAt 200 MB it runs on anything, including hardware you were about to throw away.",
    whyWePickedIt:
      "Twenty-two years of continuous development on a game that was already great produces something genuinely singular. OpenTTD is deeper than almost any commercial management game currently on sale, has a content library nothing else can match, and installs in 200 MB. It is the strongest argument we know for what open-source stewardship does for a game over time.",
    bestFor: [
      "Logistics and network optimisation as an end in itself",
      "Very long campaigns — a single game can last months",
      "Multiplayer with a group building one network together",
      "Old or very low-spec hardware",
      "Anyone who wants a vast library of official add-on content",
    ],
    notFor: [
      "You want city building and zoning rather than transport networks",
      "You dislike dense interfaces with a steep initial learning curve",
      "You want modern 3D visuals out of the box",
      "You want short sessions; this game does not respect your evening",
    ],
    comparableTo: [
      "Transport Tycoon Deluxe",
      "Cities: Skylines",
      "Transport Fever",
      "Railroad Tycoon",
    ],
    faq: [
      {
        q: "Is OpenTTD free?",
        a: "Yes, entirely. OpenTTD is open-source under GPL-2.0 with no purchases, subscriptions or advertising. The free base graphics set means you no longer need the original Transport Tycoon Deluxe files.",
      },
      {
        q: "Do I need to own Transport Tycoon Deluxe to play OpenTTD?",
        a: "No. OpenTTD ships with its own free graphics, sound and music sets, so it is a complete standalone game. You can use the original files if you own them, but it is not required.",
      },
      {
        q: "Is OpenTTD still being updated?",
        a: "Yes. OpenTTD has been in continuous development since 2004 and continues to receive regular releases, making it one of the longest continuously maintained games in existence.",
      },
      {
        q: "What is BaNaNaS in OpenTTD?",
        a: "BaNaNaS is the official in-game content service. It lets you download vehicle sets, industry chains, AI opponents, scenarios, heightmaps and graphics replacements directly inside the game, from a very large community library.",
      },
      {
        q: "Does OpenTTD have multiplayer?",
        a: "Yes, supporting dozens of simultaneous players on public or private servers, either cooperating on one company or competing as rivals. Live server and player counts are shown on the OpenTTD servers page.",
      },
      {
        q: "How is OpenTTD different from Cities: Skylines?",
        a: "OpenTTD is about transport networks between existing towns; Cities: Skylines is about designing and zoning a city itself. If you enjoy the traffic and logistics part of Skylines most, OpenTTD goes far deeper on exactly that.",
      },
    ],
  },

  luanti: {
    qualityBar: clearsAll(
      "Luanti clears all five: free with no monetisation, a mature and stable engine, actively developed, genuinely excellent as a platform, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The most common question about Luanti is whether it is a Minecraft clone, and the answer is no — it is something structurally different, which is both its greatest strength and the reason some people bounce off it in the first ten minutes.\n\nLuanti, formerly Minetest, is a free and open-source voxel game engine. Out of the box it gives you a sparse sandbox that is not trying to be a finished game. What makes it worth your time is the built-in content browser: hundreds of complete game modes, downloadable inside the client, ranging from faithful survival-crafting experiences to industrial automation, to guns-and-vehicles overhauls, to things with no Minecraft equivalent at all. Install one first. Judging Luanti by its default world is like judging a games console by the menu screen.\n\nOn technical merits it beats Minecraft in several specific places. It installs in about 150 MB against Minecraft's gigabyte-plus. It runs comfortably on hardware Minecraft cannot touch, including Raspberry Pi and decade-old laptops. World size is effectively unlimited with a far greater vertical range. Modding is first-class Lua with in-game installation, rather than Java and a third-party toolchain. Self-hosted multiplayer requires no account and no realm subscription.\n\nWhat it does not beat Minecraft on is polish and coherent design. Mojang's game is a single curated experience with two decades of art direction and content tuning behind it. Luanti's game modes are community-made and quality varies considerably. If you want to be handed something finished, that gap matters.\n\nThe compensating advantage is permanence. Luanti is open-source, self-hostable and cannot be discontinued, delisted or moved behind an account system by a corporate decision.",
    whyWePickedIt:
      "Luanti is the only voxel game we would call future-proof. Nobody can switch it off, price it, or force it through an account migration. Add that it runs on hardware nothing else will touch and installs in 150 MB, and it becomes the obvious recommendation for anyone who wants to build things without depending on a company's continued goodwill.",
    bestFor: [
      "Low-end hardware, old laptops and Raspberry Pi",
      "Anyone who wants a voxel game that cannot be shut down or repriced",
      "Modders — Lua scripting with an in-game content browser",
      "Self-hosted multiplayer with no accounts or subscriptions",
      "Players who enjoy configuring their own experience",
    ],
    notFor: [
      "You want a finished, polished game with no setup",
      "You care about Minecraft's specific content and progression design",
      "Your friends already play Minecraft and you want to join them",
      "You dislike variable community content quality",
    ],
    comparableTo: ["Minecraft", "Terraria", "Vintage Story", "Roblox"],
    faq: [
      {
        q: "Is Luanti free?",
        a: "Yes, entirely. Luanti is open-source under LGPL-2.1 with no purchase, subscription, account requirement or advertising. Every game mode in the content browser is also free.",
      },
      {
        q: "Is Luanti the same as Minetest?",
        a: "Yes. Minetest was renamed to Luanti in 2024. It is the same project with the same engine and content ecosystem.",
      },
      {
        q: "Is Luanti a good Minecraft alternative?",
        a: "It is the strongest free one, with important caveats. It is smaller, faster, runs on far weaker hardware, has first-class Lua modding, and cannot be shut down. But it is an engine with hundreds of community game modes rather than one curated game, so the default experience is sparse — install a game mode before judging it.",
      },
      {
        q: "Why does Luanti feel empty when I start it?",
        a: "Because vanilla Luanti is a platform, not a finished game. Open the content browser, install a game mode such as MineClone or a survival pack, and start a world with that instead. The default sandbox is not representative.",
      },
      {
        q: "Can Luanti run on a Raspberry Pi?",
        a: "Yes. Luanti runs on Raspberry Pi and other low-powered hardware, which is one of its clearest practical advantages over Minecraft.",
      },
      {
        q: "Does Luanti have multiplayer?",
        a: "Yes. You can join public community servers or host your own, with no account requirement and no subscription. Live server and player counts are shown on the Luanti servers page.",
      },
    ],
  },

  "endless-sky": {
    qualityBar: clearsAll(
      "Endless Sky clears all five: free with no monetisation, complete with multiple full story campaigns, actively maintained, comfortably worth a commercial price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Endless Sky is the best free game most people have never heard of, and the reason it stays obscure is that it looks like a mobile game from 2011. Get past ten minutes of that and it becomes one of the most generous single-player experiences available at any price.\n\nIt is a 2D space trading and combat game in the lineage of Escape Velocity: you start with a small ship and a large debt, haul cargo between systems, take on missions, upgrade or replace your ship, and gradually discover that the galaxy has a great deal going on. Buy low, sell high, and try not to get shot.\n\nWhat elevates it is the writing and the sheer volume of hand-authored content. This is not a procedurally generated galaxy with template quests. Every system, faction and storyline was written by someone, and there are multiple substantial campaigns with genuinely divergent paths and real consequences. The main human-space arc alone runs dozens of hours, and there are entire alien storylines beyond it that many players never see. It also has one of the more interesting endings in the genre, in that it declines to hand you a tidy resolution.\n\nCombat is readable and satisfying without being especially demanding — closer to arcade dogfighting than a simulation. Ship customisation is meaningful, with real trade-offs between speed, cargo, weapons and shields, but it is less granular than Naev's outfitting.\n\nAt 450 MB it runs on anything, and content updates ship regularly with new missions and ships from an active contributor community.",
    whyWePickedIt:
      "The gap between how Endless Sky looks and how good it is may be the widest we have encountered. It is a hand-written galaxy with dozens of hours of real writing, given away for nothing, by people who clearly cared. If you play one game from this catalog, make it this one.",
    bestFor: [
      "Story-driven space trading with genuinely good writing",
      "Long single-player campaigns — dozens of hours per arc",
      "Anyone who loved Escape Velocity or Freelancer",
      "Low-spec hardware and short sessions alike",
      "Players who want an accessible entry to the space trading genre",
    ],
    notFor: [
      "You want 3D cockpit flight rather than a top-down 2D view",
      "Dated presentation puts you off before the writing lands",
      "You want multiplayer, since this is single-player only",
      "You want the deepest possible ship outfitting; Naev goes further",
    ],
    comparableTo: ["Escape Velocity", "Elite Dangerous", "Freelancer", "Star Control"],
    faq: [
      {
        q: "Is Endless Sky free?",
        a: "Yes, entirely. Endless Sky is open-source under GPL-3.0 with no purchases, expansions or advertising. All content, including every story campaign, is included.",
      },
      {
        q: "How long is Endless Sky?",
        a: "The main human-space campaign runs several dozen hours, and there are further alien storylines beyond it. Completing everything takes well over a hundred hours.",
      },
      {
        q: "Is Endless Sky like Elite Dangerous?",
        a: "The trading, exploration and combat loop is similar in spirit, but Endless Sky is top-down 2D rather than a first-person cockpit, is single-player only, and is far more story-driven with hand-written missions instead of procedural content.",
      },
      {
        q: "Endless Sky or Naev — which should I play first?",
        a: "Endless Sky. It has stronger narrative direction, a more accessible combat model and a gentler learning curve. Play Naev afterwards if you want deeper ship outfitting and faction politics.",
      },
      {
        q: "Does Endless Sky have multiplayer?",
        a: "No. Endless Sky is a single-player game.",
      },
      {
        q: "Is Endless Sky still being updated?",
        a: "Yes. An active contributor community ships regular releases with new missions, ships and systems.",
      },
    ],
  },

  naev: {
    qualityBar: clearsAll(
      "Naev clears all five: free with no monetisation, mature and content-complete, actively developed, deep enough to justify a commercial price, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Naev is what you play after Endless Sky, when you have decided that the outfitting screen is the best part.\n\nIt occupies the same territory — 2D space trading, combat and exploration in the Escape Velocity tradition — but weights it differently. Where Endless Sky leads with writing, Naev leads with systems. Ship customisation is genuinely deep: you are fitting individual slots with weapons, utilities and structural components, balancing mass against manoeuvrability, energy regeneration against shield capacity, and heat dissipation against sustained fire. Two players flying the same hull can end up with meaningfully different ships.\n\nFaction politics carry real weight. Reputation with each of the galaxy's powers shifts based on what you do, and it gates access to missions, shipyards and territory. Playing as a pirate is a genuinely different game from playing as a trader, not a cosmetic label.\n\nCombat is more technical than Endless Sky's, with a granular damage model, weapon tracking, and electronic warfare mechanics that reward understanding rather than reflexes. The learning curve is correspondingly steeper, and the game is less inclined to tell you what to do next. Some players find that liberating and others find it aimless — it depends entirely on whether you enjoy setting your own objectives.\n\nAt around 400 MB it runs on modest hardware, and development remains steady with regular releases.",
    whyWePickedIt:
      "Naev respects your intelligence and does not hold your hand. The outfitting depth is the real draw — it is closer to a fitting simulator than a shopping screen, and getting a build right feels genuinely earned. For players who want systems over story, it is the better of the two great free space games.",
    bestFor: [
      "Deep ship outfitting and build experimentation",
      "Faction reputation systems that meaningfully change the game",
      "Players who prefer setting their own objectives",
      "Technical combat with a granular damage model",
      "Anyone who has finished Endless Sky and wants more depth",
    ],
    notFor: [
      "You want strong narrative direction — Endless Sky is the better pick",
      "You dislike steep learning curves or sparse guidance",
      "You want 3D flight rather than a top-down 2D view",
      "You want multiplayer, since this is single-player only",
    ],
    comparableTo: ["Escape Velocity Nova", "Elite Dangerous", "EVE Online", "X4: Foundations"],
    faq: [
      {
        q: "Is Naev free?",
        a: "Yes, entirely. Naev is open-source under GPL-3.0 with no purchases, DLC or advertising.",
      },
      {
        q: "Is Naev better than Endless Sky?",
        a: "Neither is better outright. Naev has deeper ship outfitting and more consequential faction politics; Endless Sky has stronger writing and a gentler introduction. Start with Endless Sky if you are new to the genre and move to Naev when you want more systems depth.",
      },
      {
        q: "Is Naev hard to learn?",
        a: "Harder than Endless Sky. The outfitting system, faction reputation and combat model all reward study, and the game gives comparatively little direction about what to do next. That openness suits some players and frustrates others.",
      },
      {
        q: "Does Naev have multiplayer?",
        a: "No. Naev is single-player only.",
      },
      {
        q: "How big is Naev?",
        a: "Around 400 MB, and it runs comfortably on modest hardware.",
      },
    ],
  },

  "warzone-2100": {
    qualityBar: clearsAll(
      "Warzone 2100 clears all five: free with no monetisation, a complete commercial game with a full campaign, still actively maintained after being open-sourced, genuinely good on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Warzone 2100 shipped in 1999 as a commercial retail game, sold reasonably, and then did something almost no commercial game does — its owners released the source code and the assets, and volunteers have been improving it ever since. Twenty-seven years later it is in better shape than it was at launch.\n\nWhat makes it distinctive is the unit designer. Most real-time strategy games hand you a fixed roster; Warzone 2100 hands you components. You research bodies, propulsion systems and weapons independently, then combine them into your own designs — a fast wheeled scout with a machine gun, a heavy tracked hull carrying artillery, a hover platform with anti-air. Because the research tree is enormous, running to hundreds of technologies, your army composition is genuinely a product of your own choices rather than a build order you looked up.\n\nThe single-player campaign is substantial and unusually well structured, carrying your units and research between missions so that losses actually matter. It is one of the better RTS campaigns of its era and it is free.\n\nThe trade-off is pace and presentation. This is a slower, more deliberate game than OpenRA, closer in tempo to 0 A.D., and it looks like what it is — a 1999 game with a lot of careful renovation. Multiplayer exists and works, with dedicated servers, but the population is modest.\n\nAt 550 MB it runs on anything, and it is one of the lighter installs among games of this scope.",
    whyWePickedIt:
      "The unit designer alone justifies it. Very few strategy games let you build your own army from researched components, and none of the ones that do are free. That Warzone 2100 was a paid retail product that its owners chose to liberate, and that volunteers have improved for nearly three decades, makes it one of the best arguments for open-source game preservation there is.",
    bestFor: [
      "Designing your own units from researched components",
      "A long, well-structured single-player campaign with persistent units",
      "Deep research trees and technology-order decisions",
      "Slower, more deliberate strategy than classic C&C",
      "Old hardware — light on resources for a game of its scope",
    ],
    notFor: [
      "You want fast matches; this is a deliberate, slow-burning game",
      "You want a large multiplayer population",
      "Dated presentation bothers you, renovation notwithstanding",
      "You prefer fixed unit rosters to component-based design",
    ],
    comparableTo: ["Command & Conquer", "Total Annihilation", "Earth 2150", "Supreme Commander"],
    faq: [
      {
        q: "Is Warzone 2100 free?",
        a: "Yes, entirely. Warzone 2100 was a commercial game in 1999 whose source code and assets were later released. It is now open-source under GPL-2.0 with no purchases or advertising.",
      },
      {
        q: "Is Warzone 2100 still being updated?",
        a: "Yes. Volunteers have maintained and improved it continuously since it was open-sourced, and releases continue to ship.",
      },
      {
        q: "Does Warzone 2100 have a single-player campaign?",
        a: "Yes, a substantial one. Units and research carry between missions, so losses have lasting consequences — one of the more interesting campaign structures of its era.",
      },
      {
        q: "What makes Warzone 2100 different from other RTS games?",
        a: "The unit designer. Instead of a fixed roster you research bodies, propulsion and weapons separately and combine them into your own designs, backed by a research tree running to hundreds of technologies.",
      },
      {
        q: "Does Warzone 2100 have multiplayer?",
        a: "Yes, including dedicated servers, though the player population is modest compared with newer free strategy games. Live server counts are shown on the Warzone 2100 servers page.",
      },
    ],
  },

  xonotic: {
    qualityBar: clearsAll(
      "Xonotic clears all five: free with no monetisation, complete and polished, still maintained, an excellent arena shooter judged on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The classic arena shooter is close to extinct as a commercial product. Quake Champions faded, Unreal Tournament was cancelled outright, and what remains of the genre on sale is mostly nostalgia re-releases. Xonotic is the genre's living continuation, and it is free.\n\nThis is a fast, movement-heavy first-person shooter in the direct lineage of Quake III Arena and Nexuiz before it. No loadouts, no unlock trees, no progression systems, no cosmetics — you spawn with a basic weapon and everything else is on the map. Weapon control, positioning and map knowledge are the entire game.\n\nThe movement deserves specific mention because it is the reason people stay. Xonotic's movement is faster and more technical than Quake III's, with its own mechanics to master, and the skill ceiling is genuinely high. Learning to chain jumps and maintain speed across a map takes real practice and feels excellent once it clicks. The engine runs at very high frame rates on modest hardware, which matters enormously in a game this fast.\n\nBot support is strong, which is more important than it sounds for a free shooter — you can practise properly offline and learn maps without depending on server population. Public servers are consistently populated, though numbers are far below commercial shooters, and there is an active competitive duel and team scene.\n\nThe caveats are honest ones. Player counts are modest, the art direction is functional rather than striking, and the technical movement is a genuine barrier for players used to modern grounded shooters. At around 1.1 GB it is a mid-sized install.",
    whyWePickedIt:
      "Someone had to keep the arena shooter alive after the commercial industry abandoned it, and Xonotic did. The movement is deeper than the games it descends from, the frame rates are excellent on cheap hardware, and it has never asked anyone for money. If you miss the days before loadouts, this is where they went.",
    bestFor: [
      "Classic arena shooting with no loadouts or progression",
      "Technical movement with a very high skill ceiling",
      "Very high frame rates on modest hardware",
      "Offline practice against strong bots",
      "LAN parties — no accounts, no internet required",
    ],
    notFor: [
      "You want large player populations at any hour",
      "You prefer grounded modern shooters to fast strafe-jumping",
      "You want progression, unlocks or cosmetics as motivation",
      "You care about striking art direction over function",
    ],
    comparableTo: ["Quake III Arena", "Unreal Tournament", "Quake Live", "Diabotical"],
    faq: [
      {
        q: "Is Xonotic free?",
        a: "Yes, entirely. Xonotic is open-source under GPL-2.0 with no purchases, battle passes, cosmetics or advertising of any kind.",
      },
      {
        q: "Is Xonotic like Quake?",
        a: "Yes, directly. Xonotic descends from the Quake III Arena tradition via Nexuiz, with no loadouts, map-based weapon pickups and movement-centric play. Its movement is faster and somewhat more technical than Quake III's.",
      },
      {
        q: "Does Xonotic have bots?",
        a: "Yes, and they are good enough for genuine practice. You can learn maps and weapon timings entirely offline, which makes the game viable regardless of server population.",
      },
      {
        q: "How many players does Xonotic have?",
        a: "Public servers are consistently populated but numbers are modest compared with commercial shooters. Live server and player counts are shown on the Xonotic servers page.",
      },
      {
        q: "Will Xonotic run on an old computer?",
        a: "Yes, very well. The engine is efficient and reaches high frame rates on hardware that struggles with modern shooters, which matters in a game this fast.",
      },
    ],
  },

  unvanquished: {
    qualityBar: clearsAll(
      "Unvanquished clears all five: free with no monetisation, complete and playable, actively developed, genuinely distinctive on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Unvanquished does something no commercial game currently does: it puts a real-time strategy game and a first-person shooter in the same match, on opposite sides.\n\nTwo asymmetric teams face off. The humans are a conventional FPS side — projectile weapons, armour upgrades, and a base of turrets, armouries and repair stations that someone has to actually build and maintain. The aliens are melee-focused, wall-climbing, and evolve into larger and more dangerous forms as they accumulate resources, expanding their hive through organic structures. Neither side plays remotely like the other, and neither wins by shooting alone. Construction, resource control and map presence decide matches.\n\nThe result is a team game with genuine strategic texture, descended from the beloved Tremulous, running on a modern engine with far better performance and visuals. When it works — a coordinated team pushing a fortified position while their base holds behind them — there is nothing else quite like it.\n\nThe honest problem is that it requires a team willing to coordinate. A side that ignores building loses, and a side where nobody communicates loses to one that does. This makes Unvanquished excellent on a populated, engaged server and frustrating on an empty one. Bot support exists but is limited, so it is not a satisfying solo game. Player counts are the smallest of anything we list.\n\nAt 850 MB it installs quickly and is not especially demanding, though it wants a dedicated GPU.",
    whyWePickedIt:
      "We list Unvanquished because nothing else does what it does. The FPS/RTS hybrid is a genuinely rare design, and the free open-source world is the only place it survived. It needs a populated server to shine, which is a real caveat — but when it has one, it is the most interesting multiplayer game in this catalog.",
    bestFor: [
      "Something structurally unlike any commercial game",
      "Asymmetric team play with real strategic decisions",
      "Players who enjoy base building inside a shooter",
      "Coordinated groups playing together",
      "Fans of the original Tremulous",
    ],
    notFor: [
      "You want to play alone — bot support is limited",
      "You want a populated server at any hour",
      "You dislike coordinating with teammates to win",
      "You want a straightforward deathmatch shooter; Xonotic is that",
    ],
    comparableTo: ["Tremulous", "Natural Selection 2", "Savage 2", "Nuclear Dawn"],
    faq: [
      {
        q: "Is Unvanquished free?",
        a: "Yes, entirely. Unvanquished is open-source with no purchases, cosmetics or advertising.",
      },
      {
        q: "What kind of game is Unvanquished?",
        a: "An asymmetric FPS/RTS hybrid. Humans use projectile weapons and build a base of turrets and support structures; aliens use melee and wall-climbing and evolve into larger forms. Both sides depend on construction and resource control, not just combat.",
      },
      {
        q: "Is Unvanquished related to Tremulous?",
        a: "Yes. Unvanquished is a spiritual successor to Tremulous, keeping the asymmetric humans-versus-aliens design while running on a substantially more modern engine.",
      },
      {
        q: "Can I play Unvanquished alone?",
        a: "Not satisfyingly. Bot support exists but is limited, and the game depends on coordinated teams on populated servers. It is a multiplayer game first and foremost.",
      },
      {
        q: "How many players does Unvanquished have?",
        a: "The population is small — the smallest in the PlayBound catalog. Check the Unvanquished servers page for live counts before setting aside an evening for it.",
      },
    ],
  },

  "battle-for-wesnoth": {
    qualityBar: clearsAll(
      "The Battle for Wesnoth clears all five: free with no monetisation, exceptionally complete with hundreds of hours of campaigns, still maintained after two decades, better than most commercial tactics games, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "The Battle for Wesnoth has been in development since 2003 and has quietly accumulated more turn-based tactical content than any commercial game in the genre. If you like Fire Emblem or Advance Wars and you want hundreds of hours for nothing, this is where to go.\n\nThe core is hex-grid turn-based tactics with a fantasy setting. Units occupy terrain that modifies their defence, a day-night cycle strengthens some factions and weakens others, and combat resolution is probabilistic — which means positioning and risk management matter more than raw unit strength. Units gain experience and advance into stronger forms, and crucially they persist between missions within a campaign, so a veteran you have carefully levelled is a real asset and losing them genuinely hurts.\n\nThe volume of content is the headline. The official campaigns alone run to well over a hundred hours across a dozen distinct storylines, several of which are properly written. Beyond that, the in-game add-on server hosts hundreds of community campaigns, some of which are better than the official ones. You could play this game for years without exhausting it.\n\nMultiplayer is turn-based and works well both online and hotseat, with an active community and a long-running competitive ladder.\n\nThe caveats are the probabilistic combat, which frustrates players who want deterministic outcomes, and the art style, which is consistent and characterful but plainly the work of volunteers over two decades. At 700 MB it runs on anything.",
    whyWePickedIt:
      "Two decades of accumulated campaigns makes Wesnoth almost absurd value — hundreds of hours of hand-crafted tactical content, given away, with hundreds more from the community on top. The persistent-unit campaign structure creates real attachment to your veterans in a way few games manage. It is one of the deepest games in this catalog by a wide margin.",
    bestFor: [
      "Turn-based tactics fans — Fire Emblem, Advance Wars, Final Fantasy Tactics",
      "Enormous amounts of single-player campaign content",
      "Persistent units that level up and carry between missions",
      "Hotseat and online turn-based multiplayer",
      "Very low-spec hardware and short sessions",
    ],
    notFor: [
      "You dislike probabilistic combat and want deterministic outcomes",
      "You want real-time rather than turn-based play",
      "Volunteer-made art direction bothers you",
      "You want modern presentation and full voice acting",
    ],
    comparableTo: ["Fire Emblem", "Advance Wars", "Final Fantasy Tactics", "Heroes of Might and Magic"],
    faq: [
      {
        q: "Is The Battle for Wesnoth free?",
        a: "Yes, entirely. Wesnoth is open-source under GPL-2.0 with no purchases or advertising. Every official campaign and all community add-ons are free.",
      },
      {
        q: "How much content does Wesnoth have?",
        a: "The official campaigns alone run to well over a hundred hours across roughly a dozen storylines, and the in-game add-on server hosts hundreds of additional community campaigns.",
      },
      {
        q: "Is Wesnoth like Fire Emblem?",
        a: "Broadly yes — hex-grid turn-based tactics with units that gain experience and advance. Wesnoth uses probabilistic combat resolution and terrain-based defence modifiers, and has far more content, but no permadeath outside optional settings.",
      },
      {
        q: "Does Wesnoth have multiplayer?",
        a: "Yes, both online and hotseat, with an active community and a long-standing competitive ladder.",
      },
      {
        q: "Is Wesnoth still being updated?",
        a: "Yes. Wesnoth has been in continuous development since 2003 and continues to receive releases.",
      },
    ],
  },

  supertuxkart: {
    qualityBar: clearsAll(
      "SuperTuxKart clears all five: free with no monetisation, complete with a full campaign and multiplayer, actively developed, genuinely fun on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Mario Kart requires buying Nintendo hardware. SuperTuxKart requires a computer you already own, and it is the closest free equivalent that exists.\n\nThis is a kart racer with the full formula intact: drifting, item boxes, defensive and offensive power-ups, rubber-banding to keep races close, and tracks designed with shortcuts worth learning. There are dozens of tracks and arenas, a story mode with a proper progression of challenges, time trials, and — importantly — local split-screen for up to four players on one machine. Online racing works too, with public servers and no account requirement.\n\nWhat makes it more than a curiosity is that the track design is genuinely good. Several courses stand comparison with commercial kart racers, with layered routes and shortcuts that reward learning. Handling is slightly floatier than Nintendo's and drifting takes some acclimatisation, but it is consistent and satisfying once you adjust.\n\nThe roster is open-source mascots rather than familiar characters, which will either charm you or leave you cold. Presentation is bright and competent without matching Nintendo's polish, and there is no getting around the fact that Mario Kart 8 Deluxe is a more refined product. But Mario Kart 8 Deluxe costs money and needs a Switch, and this does not.\n\nAt roughly 1 GB it runs on modest hardware, and gamepads are properly supported — which matters, because this is a couch game first.",
    whyWePickedIt:
      "Local split-screen multiplayer is a dying feature and SuperTuxKart has it for four players, for free, on hardware you already own. The track design is better than a free kart racer has any obligation to be, and it is the game we recommend most often to anyone who needs something for a room full of people.",
    bestFor: [
      "Four-player local split-screen on one machine",
      "Anyone who wants Mario Kart without Nintendo hardware",
      "Family and living-room play with gamepads",
      "A story mode with real progression, not just quick races",
      "Free online racing with no account required",
    ],
    notFor: [
      "You want Nintendo's characters and polish specifically",
      "You are used to frame-perfect Mario Kart drift timing",
      "You want a large competitive online population",
      "You dislike open-source mascot characters",
    ],
    comparableTo: ["Mario Kart 8", "Crash Team Racing", "Sonic & All-Stars Racing", "Diddy Kong Racing"],
    faq: [
      {
        q: "Is SuperTuxKart free?",
        a: "Yes, entirely. SuperTuxKart is open-source under GPL-3.0 with no purchases, cosmetics or advertising.",
      },
      {
        q: "Does SuperTuxKart have split-screen?",
        a: "Yes, local split-screen for up to four players on one machine, with full gamepad support. It is one of the game's strongest features.",
      },
      {
        q: "Is SuperTuxKart a good Mario Kart alternative?",
        a: "It is the closest free equivalent. Drifting, item boxes, power-ups, split-screen and a story mode are all present, and several tracks are genuinely well designed. Handling is slightly floatier and the presentation is less polished than Mario Kart 8 Deluxe, but it costs nothing and needs no console.",
      },
      {
        q: "Does SuperTuxKart have online multiplayer?",
        a: "Yes, with public servers and no account requirement. Live server and player counts are shown on the SuperTuxKart servers page.",
      },
      {
        q: "Will SuperTuxKart run on a low-end laptop?",
        a: "Yes. It scales down well and runs acceptably on integrated graphics, though a dedicated GPU gives smoother frame rates at higher settings.",
      },
    ],
  },

  supertux: {
    qualityBar: clearsAll(
      "SuperTux clears all five: free with no monetisation, complete with a full campaign and level editor, still maintained, genuinely enjoyable on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "SuperTux is a 2D side-scrolling platformer built openly and unapologetically in the Super Mario Bros. mould, and it has been quietly improving for over two decades.\n\nThe formula is exactly what you would expect and that is the point: run, jump, stomp enemies, collect coins, find secrets, reach the flag. There is a world map connecting levels, power-ups that change what you can do, and level design that escalates in difficulty at a sensible rate. Two full worlds of levels ship with the game, plus a substantial set of community add-on levels.\n\nThe standout feature is the built-in level editor. It is proper and complete, not a toy, and it has produced a real community of level designers. If you have ever wanted to build Mario levels without buying Super Mario Maker, this is the free route to it.\n\nJump physics are close to Nintendo's but not identical, and that matters more than it sounds. If you have thousands of hours of Mario muscle memory you will notice the difference in air control and momentum for the first hour. It is internally consistent and perfectly learnable — just not a clone.\n\nThe honest assessment is that the level design is good rather than exceptional. Nintendo's relentless inventiveness — a new idea every thirty seconds — is very hard to match, and SuperTux does not match it. What it offers instead is a solid, complete, free platformer with an excellent editor, on any computer, forever.\n\nAt 150 MB it is one of the smallest games in the catalog.",
    whyWePickedIt:
      "Free 2D platformers are mostly rough. SuperTux is not — it is complete, consistent and has been polished across two decades, and the level editor turns it into something with far more longevity than the shipped campaign alone. For a 150 MB download that runs on anything, it is remarkable value.",
    bestFor: [
      "Classic 2D platforming without buying a Nintendo console",
      "Building your own levels with a proper built-in editor",
      "Very low-spec hardware — a 150 MB install",
      "Short sessions and pick-up-and-play",
      "Younger players, with straightforward and friendly design",
    ],
    notFor: [
      "You expect frame-perfect Nintendo jump physics",
      "You want Mario's relentless level-design inventiveness",
      "You want multiplayer, since this is single-player",
      "You want modern visual production values",
    ],
    comparableTo: ["Super Mario Bros.", "Super Mario World", "Celeste", "Super Mario Maker"],
    faq: [
      {
        q: "Is SuperTux free?",
        a: "Yes, entirely. SuperTux is open-source under GPL-3.0 with no purchases or advertising.",
      },
      {
        q: "Is SuperTux like Super Mario Bros.?",
        a: "Very much so by design — running, jumping, stomping enemies, power-ups and a world map. Jump physics are close but not identical, so expect a short adjustment period if you have extensive Mario experience.",
      },
      {
        q: "Does SuperTux have a level editor?",
        a: "Yes, a complete built-in editor, which has produced an active community of level designers. It is the closest free equivalent to Super Mario Maker on a computer.",
      },
      {
        q: "How long is SuperTux?",
        a: "Two full worlds of levels ship with the game, plus a substantial library of community add-on levels — several hours for the base campaign and considerably more with community content.",
      },
      {
        q: "Is SuperTux suitable for children?",
        a: "Yes. It is bright, friendly, has no violence beyond cartoon enemy-stomping, requires no account, has no purchases and no online interaction with strangers.",
      },
    ],
  },

  hedgewars: {
    qualityBar: clearsAll(
      "Hedgewars clears all five: free with no monetisation, complete and content-rich, still maintained after two decades, genuinely funny and good on its own merits, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Turn-based artillery is a genre almost entirely defined by one paid series, and Hedgewars is the free equivalent that has been going since 2004.\n\nThe formula is Worms, faithfully: two or more teams take turns lobbing absurd weaponry across fully destructible terrain, with wind, angle and power to account for and a time limit per turn to keep things moving. The weapon roster is large and gleefully ridiculous — bazookas and grenades alongside sheep launchers, piano drops and things best discovered in play. Terrain deforms permanently, so a long match slowly demolishes the map beneath everyone.\n\nWhat makes Hedgewars work is that it understood the assignment. The weapons are funny, the physics are readable, the turn timer keeps matches brisk, and the whole thing is designed around a group of people in one room shouting at each other. Hotseat multiplayer on a single machine is the primary mode and it is excellent. Online multiplayer works too, with public rooms, plus a campaign and training missions for solo play.\n\nThe roster is hedgehogs rather than worms, weapon balance differs from any specific Worms entry, and the presentation is charming but plainly less polished than recent commercial releases. Those are the honest gaps, and none of them matter much when four people are crowded around one keyboard.\n\nAt 180 MB it is among the smallest games we list and runs on anything with a screen.",
    whyWePickedIt:
      "Hedgewars is a party game, and party games are judged on whether the room laughs. This one does. Twenty-two years of development have produced a deep weapon roster and consistent physics, and it needs no accounts, no internet and no hardware to speak of — just a keyboard and some people willing to take turns.",
    bestFor: [
      "Hotseat multiplayer with several people on one machine",
      "Party and living-room play with no setup",
      "Anyone who wants Worms without paying for it",
      "Very low-spec hardware — a 180 MB install",
      "Short sessions with a natural stopping point",
    ],
    notFor: [
      "You want recent commercial Worms polish and production values",
      "You are playing entirely alone; the campaign is secondary",
      "You want real-time action rather than turn-based play",
      "You want a large online population",
    ],
    comparableTo: ["Worms Armageddon", "Worms W.M.D", "Scorched Earth", "Gunbound"],
    faq: [
      {
        q: "Is Hedgewars free?",
        a: "Yes, entirely. Hedgewars is open-source under GPL-2.0 with no purchases, DLC or advertising.",
      },
      {
        q: "Is Hedgewars like Worms?",
        a: "Yes, closely. Turn-based artillery with destructible terrain, wind and angle mechanics, a large absurd weapon roster and hotseat multiplayer. Hedgehogs replace worms and weapon balance differs, but the formula is faithfully reproduced.",
      },
      {
        q: "Can several people play Hedgewars on one computer?",
        a: "Yes — hotseat multiplayer on a single machine is the primary mode and requires no extra controllers, accounts or internet connection.",
      },
      {
        q: "Does Hedgewars have single-player content?",
        a: "Yes, including a campaign, training missions and matches against AI opponents, though the game is at its best with other people.",
      },
      {
        q: "Does Hedgewars have online multiplayer?",
        a: "Yes, with public rooms and an official server. Live server and player counts are shown on the Hedgewars servers page.",
      },
    ],
  },

  veloren: {
    qualityBar: {
      genuinelyFree: true,
      // Under active development and openly pre-1.0. Honest scoring: this is
      // the one criterion Veloren does not yet clearly clear.
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Veloren clears four of five. It is genuinely free, very actively developed, good on its own merits and permanently open-source — but it is openly pre-release, and systems still change between versions. We list it because what exists is already worth playing, with that caveat stated plainly.",
      lastVerified: VERIFIED,
    },
    longDescription:
      "Veloren is the most ambitious game in this catalog and the one we are most careful about recommending, because it is honest about being unfinished and we should be too.\n\nIt is a multiplayer voxel action RPG, drawing openly on Cube World and Zelda: Breath of the Wild. The world is procedurally generated at genuinely large scale, with distinct biomes, weather, dungeons and a day-night cycle, all rendered in a voxel art style that is considerably more attractive than the description suggests. Combat is real-time and skill-based — dodging, timing and stamina management rather than tab-targeting — and there is character progression, crafting, gliding, sailing and mount taming.\n\nWhat makes Veloren interesting is that it is a fully open-source MMO-scale project that actually runs. You can host your own server for friends, join public ones, or play solo, and none of it costs anything or requires an account with anyone.\n\nThe caveat is real. Veloren is pre-1.0 and says so. Progression systems, combat balance and content get reworked between releases, worlds are sometimes reset, and the loot economy is not mature. If you want a stable game with a settled endgame, this is not yet it.\n\nWe list it anyway because what exists is already enjoyable — exploring a freshly generated world, fighting through a dungeon with friends, and gliding off a mountain are all good right now. Treat it as an excellent game in progress rather than a finished product, and it will not disappoint you.\n\nAt roughly 1 GB it wants a dedicated GPU for comfortable frame rates.",
    whyWePickedIt:
      "An open-source, self-hostable action RPG at this scale should not exist, and yet it runs and it is fun. We are including it with the honest note that it is unfinished, because the alternative — quietly omitting it — would hide one of the most impressive things happening in free games right now. Play it for what it is.",
    bestFor: [
      "Exploring large procedurally generated worlds",
      "Real-time skill-based combat rather than tab-targeting",
      "Self-hosting a small server for friends, free and account-free",
      "Anyone interested in an ambitious open-source project in motion",
      "Players comfortable with a game that changes between releases",
    ],
    notFor: [
      "You want a finished, stable game with a settled endgame",
      "You dislike progression reworks and occasional world resets",
      "You want a mature loot economy and balanced itemisation",
      "You are on integrated graphics; it wants a dedicated GPU",
    ],
    comparableTo: ["Cube World", "The Legend of Zelda: Breath of the Wild", "Valheim", "Minecraft"],
    faq: [
      {
        q: "Is Veloren free?",
        a: "Yes, entirely. Veloren is open-source under GPL-3.0 with no purchases, subscriptions, cosmetics or account requirement.",
      },
      {
        q: "Is Veloren finished?",
        a: "No, and it does not claim to be. Veloren is pre-1.0 and under very active development. Progression systems and combat balance change between releases and worlds are occasionally reset. What exists is enjoyable, but it is a game in progress.",
      },
      {
        q: "Can I host my own Veloren server?",
        a: "Yes. Self-hosting is fully supported and free, with no account or licence required, which makes it a good option for a small private world with friends.",
      },
      {
        q: "Is Veloren like Minecraft?",
        a: "It shares the voxel aesthetic but is a different game. Veloren is an action RPG focused on exploration, real-time combat and character progression rather than free-form building.",
      },
      {
        q: "What are Veloren's system requirements?",
        a: "A dedicated GPU is recommended for comfortable frame rates, alongside a quad-core CPU and 8 GB of RAM. It is more demanding than most games in this catalog.",
      },
    ],
  },

  "shattered-pixel-dungeon": {
    qualityBar: clearsAll(
      "Shattered Pixel Dungeon clears all five: free with no monetisation on desktop, complete and exceptionally well balanced, actively developed with regular releases, better than most paid roguelikes, and high quality enough to earn a place in a deliberately small catalog."
    ),
    longDescription:
      "Shattered Pixel Dungeon is the best-balanced roguelike we know of that costs nothing, and it fits in under 100 MB.\n\nIt is a traditional roguelike in the strict sense: turn-based, grid-based, procedurally generated dungeons, permanent death, and unidentified items you have to risk using to learn what they are. You pick one of several classes, descend through increasingly hostile floors, and almost certainly die somewhere in the middle while learning something useful for next time.\n\nWhat distinguishes it from the many free roguelikes is balance. This is a game that has been tuned obsessively over years, and it shows in how many viable builds exist. Almost every item has a use, almost every class has multiple genuine strategies, and losing rarely feels arbitrary — you can usually identify the decision that killed you. That is much harder to achieve than it sounds and it is why the game sustains hundreds of runs.\n\nThe item identification system deserves specific mention because it drives the tension. An unidentified potion might save your run or end it, and deciding when to gamble is the central skill. Combined with permadeath, this produces the specific roguelike quality where each run teaches you something that makes the next one better.\n\nIt is turn-based and pixel-art, so if you want real-time action or modern visuals, look elsewhere — Veloren is the alternative in this catalog. And permadeath means nothing carries over between runs, which some players find punishing rather than motivating.\n\nThe desktop version is free and open-source. The mobile store listings are the only place any payment exists.",
    whyWePickedIt:
      "Balance is the hardest thing to get right in a roguelike and this one nails it — hundreds of runs in, you are still finding viable builds and still learning. That it is under 100 MB, free, open-source and runs on literally anything makes it the single best value in the catalog by download size.",
    bestFor: [
      "Traditional turn-based roguelikes with permadeath",
      "Exceptional balance and genuinely varied viable builds",
      "Very short sessions — a run fits into a lunch break",
      "The smallest hardware and storage requirements in the catalog",
      "Players who want difficulty that feels fair rather than random",
    ],
    notFor: [
      "You want real-time action combat",
      "You dislike permadeath and losing all progress on a run",
      "You want modern visuals rather than pixel art",
      "You want multiplayer, since this is single-player only",
    ],
    comparableTo: ["Diablo", "Slay the Spire", "NetHack", "Dead Cells"],
    faq: [
      {
        q: "Is Shattered Pixel Dungeon free?",
        a: "The desktop version is entirely free and open-source under GPL-3.0 with no purchases or advertising. The iOS and Android store listings are paid, which is the only place money changes hands.",
      },
      {
        q: "Is Shattered Pixel Dungeon good for roguelike beginners?",
        a: "Yes, unusually so. The rules are transparent, deaths are almost always explicable, and runs are short enough that starting again is cheap. It is one of the better introductions to the genre.",
      },
      {
        q: "How long is a run in Shattered Pixel Dungeon?",
        a: "A full successful run takes roughly an hour or two. Most early runs end much sooner, which is part of the design — each attempt teaches you something.",
      },
      {
        q: "Does Shattered Pixel Dungeon have permadeath?",
        a: "Yes. Death ends the run and nothing carries over except what you have learned. This is central to the design rather than an obstacle to it.",
      },
      {
        q: "How is Shattered Pixel Dungeon different from Pixel Dungeon?",
        a: "Shattered Pixel Dungeon is a long-running, heavily expanded fork of the original Pixel Dungeon, with substantially more content, more classes and far more refined balance. It is the actively developed version.",
      },
    ],
  },

  everquest: {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "EverQuest still earns a place as the foundational fantasy MMO, but Live is free-to-play with a cash shop and All Access — not a no-monetisation title. Community editions are separate worlds with their own rules.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "EverQuest is the game that taught a generation what an MMO could feel like: a hostile world, a social contract, and the sense that the dungeon down the road might actually kill you. PlayBound lists it as a franchise with three playable editions rather than a single installer, because “EverQuest” now means official Live, Project Quarm, and Project 1999, and those are not interchangeable clients.\n\nEverQuest Live is Daybreak’s current game. You create a Daybreak account, run LaunchPad, and enter a world that has been patched for more than two decades. It is free to download and play, with optional All Access if you want fewer F2P limits. Live is the legal, supported way to play the franchise as it exists in 2026, with modern convenience and a very different pacing from 1999.\n\nProject Quarm is a community era that uses the TAKP classic client. PlayBound can fetch the public base client, but you still need TAKP accounts and the latest Quarm Discord patch. Project 1999 recreates late-classic / early-Velious on community servers and requires a legal Titanium install that PlayBound will copy and overlay — it never redistributes Titanium.\n\nNone of the community editions are affiliated with Daybreak. Install only from the edition pages and the channels those communities publish. If you want official support, pick Live. If you want a specific classic feeling, read the Quarm and P99 guides before you download anything.",
    whyWePickedIt:
      "PlayBound is a catalog of things you can actually launch. EverQuest still has three living ways to do that — official Live plus two community eras with real populations — and pretending they are one download would send people to the wrong login screen.",
    bestFor: [
      "Players who want the original fantasy MMO, not a theme-park sequel",
      "People willing to read an edition guide before installing",
      "Classic-era fans who already own legal Titanium (for Project 1999)",
      "Anyone curious about official Live without paying up front",
    ],
    notFor: [
      "You want a single one-click client that covers every EverQuest server",
      "You expect a modern action combat MMO with a short onboarding",
      "You want a game with no cash shop or subscription options on Live",
      "You are looking for a Daybreak-supported private server",
    ],
    comparableTo: ["World of Warcraft Classic", "Ultima Online", "Dark Age of Camelot", "EverQuest II"],
    installSteps: [
      {
        platform: "all",
        text: "EverQuest on PlayBound is three editions. Choose EverQuest Live for official Daybreak, Project Quarm for TAKP-era community progression, or Project 1999 if you own a legal Titanium client.",
      },
      {
        platform: "all",
        text: "Open that edition’s page and follow its install guide. Live uses Daybreak LaunchPad; Quarm installs a community client plus a Discord patch; P99 copies your Titanium folder and overlays public P99Files.",
      },
      {
        platform: "windows",
        text: "Create the matching account before you click Play: a Daybreak account for Live, a TAKP forum plus login-server account for Quarm, or a Project 1999 forum plus login-server account for P99.",
      },
    ],
    faq: [
      {
        q: "Is EverQuest free?",
        a: "EverQuest Live is free to download and play with a Daybreak account. An optional All Access subscription removes more free-to-play limits. Community editions have their own rules and are not Daybreak products.",
      },
      {
        q: "Which EverQuest edition should I install?",
        a: "Live if you want the official game. Project Quarm if you want a curated classic-style community era and are willing to patch from Discord. Project 1999 if you already own legal Titanium and want that specific recreation.",
      },
      {
        q: "Does PlayBound host EverQuest game files?",
        a: "No. Live downloads Daybreak’s LaunchPad. Quarm uses a public community zip plus patches from Quarm’s own Discord. P99 only copies a Titanium folder you already own and merges public P99Files.",
      },
      {
        q: "Can I play EverQuest solo?",
        a: "Yes. It is still an MMO, so towns and dungeons are shared, but many classes can progress alone at their own pace. Group content remains the historic heart of the game.",
      },
      {
        q: "Are Quarm and Project 1999 official?",
        a: "No. They are community projects and are not affiliated with Daybreak. Use only the websites, forums, and Discord servers linked on each edition page.",
      },
    ],
  },

  flightgear: {
    qualityBar: clearsAll(
      "FlightGear clears all five: genuinely free, complete enough to fly worldwide, still maintained, serious enough to recommend against paid sims, and high quality for anyone who wants simulation rather than an arcade flyer."
    ),
    longDescription:
      "FlightGear is what you get when a flight simulator is treated as a public research project instead of a storefront. It models aircraft, weather, and a planet-sized scenery set, and it does that without a subscription or a scenery marketplace. The first hour is not a tutorial in the Microsoft Flight Simulator sense — it is closer to sitting down in a real cockpit binder and figuring out which switches matter.\n\nThe payoff is scope. You can fly a Cessna around a local field, line up an airliner on a Canvas glass cockpit, or join multiplayer traffic over published frequencies. Aircraft quality varies because the fleet is a community: some planes are museum pieces, others are the reason people stay. Worldwide scenery via TerraSync is large; plan disk space the way you would for any serious sim, not a casual download.\n\nIt is heavier than a browser flyer and more fiddly than a console racing game with wings. Joysticks help. Reading the wiki helps. If you wanted arcade dogfights, this is the wrong catalog page. If you wanted an open-source sim that still takes the physics seriously in 2026, it is one of the few that does.",
    whyWePickedIt:
      "Most free ‘flight games’ are toys. FlightGear is a simulator with worldwide scenery and a living aircraft library, and it remains the open-source answer when someone asks whether they have to pay for that kind of depth.",
    bestFor: [
      "People who want a real flight sim rather than an arcade flyer",
      "Joystick and yoke users who will read a checklist",
      "Multiplayer flying and exploring real-world airports",
      "Anyone willing to trade polish for an open aircraft and scenery pipeline",
    ],
    notFor: [
      "You want a ten-minute pick-up-and-play flying game",
      "You have a small SSD and no room for scenery",
      "You need a hand-holding career mode like a commercial consumer sim",
      "You expected console-style presentation out of the box",
    ],
    comparableTo: ["Microsoft Flight Simulator", "X-Plane", "Prepar3D", "DCS World"],
    installSteps: [
      {
        platform: "all",
        text: "Install FlightGear with the PlayBound launcher, or download the official Windows/macOS/Linux build from flightgear.org. Avoid third-party mirrors.",
      },
      {
        platform: "windows",
        text: "Finish the official setup wizard, then launch FlightGear. The first run may fetch extra aircraft or scenery — let it finish before judging performance.",
      },
      {
        platform: "all",
        text: "Start with a simple piston aircraft at a familiar airport. Open settings for view, frame rate, and TerraSync before loading a heavy airliner.",
      },
    ],
    faq: [
      {
        q: "Is FlightGear free?",
        a: "Yes. FlightGear is open-source under the GPL. There is no purchase, subscription, or scenery shop required to fly.",
      },
      {
        q: "How much disk space does FlightGear need?",
        a: "The base simulator is a few gigabytes. Worldwide scenery via TerraSync can grow into tens of gigabytes depending on where you fly. Treat recommended storage as a scenery budget, not just the installer size.",
      },
      {
        q: "Does FlightGear work with a joystick?",
        a: "Yes, and it is strongly recommended. Keyboard flying is possible for a first takeoff; a joystick or yoke makes the sim much more usable.",
      },
      {
        q: "Can I fly online in FlightGear?",
        a: "Yes. FlightGear has a multiplayer network. Use published procedures and frequencies, and read the multiplayer guide before joining busy airspace.",
      },
      {
        q: "Is FlightGear as pretty as Microsoft Flight Simulator?",
        a: "Not in the photogrammetry sense. FlightGear’s strength is an open aircraft and scenery pipeline you can inspect and extend, not competing with a paid streaming globe.",
      },
    ],
  },

  freeciv: {
    qualityBar: clearsAll(
      "Freeciv clears all five: no monetisation, a complete empire-builder, still maintained after decades, good enough to recommend beside paid 4X games, and distinctive because the rulesets are the point."
    ),
    longDescription:
      "Freeciv is the long game of free strategy: a Civilization-inspired empire builder that has been rewritten, re-themed, and re-argued about since the mid-1990s. You settle cities, research a tech tree, wrangle governments, and try not to lose a veteran army to a spearmen joke you walked into. The classic loop is intact. What makes Freeciv itself is that almost none of that loop is frozen.\n\nRulesets are first-class. Classic, Civ2Civ3, experimental, alien, and community packs change what a ‘civ’ even is. Longturn games stretch a match across real-world days. Hotseat still exists for people who share a machine. The GTK and Qt clients are utilitarian in the way serious hobby software is utilitarian — they are there to host a ruleset, not to sell you a season pass.\n\nIt will not look like Civilization VI. It will not hold your hand through a cinematic advisor. It will let you play a 4X on a laptop from 2012, host a server for friends, and still be talking about the same design arguments the project had twenty years ago. That continuity is the feature.",
    whyWePickedIt:
      "If you want Civilization without a storefront, Freeciv is the honest answer: not a clone with a new coat of paint, but a thirty-year ruleset laboratory that is still played online.",
    bestFor: [
      "Civilization fans who want a free, moddable 4X",
      "Longturn and multiplayer diplomacy games",
      "Players who enjoy tinkering with rulesets and tilesets",
      "Low-spec machines that still want a full empire-builder",
    ],
    notFor: [
      "You want AAA 3D presentation and cinematic leaders",
      "You refuse to read a manual or a ruleset description",
      "You need a single ‘official’ balance forever",
      "You only want a two-hour campaign with a scripted story",
    ],
    comparableTo: ["Sid Meier's Civilization", "Civilization II", "Civilization III", "C-evo"],
    installSteps: [
      {
        platform: "all",
        text: "Install Freeciv with the PlayBound launcher, which opens the official Windows GTK4 setup, or download a package from freeciv.org for your OS.",
      },
      {
        platform: "windows",
        text: "Finish the official installer, then launch the GTK4 client. Start a local game against AI before joining a public server so you learn the UI.",
      },
      {
        platform: "all",
        text: "Pick a ruleset you recognise (classic or civ2civ3) for the first match. Custom tilesets and Longturn games can wait until the basics click.",
      },
    ],
    faq: [
      {
        q: "Is Freeciv free?",
        a: "Yes. Freeciv is open-source (GPL) with no purchase or in-game shop. Optional donations support the project; they are not required to play.",
      },
      {
        q: "Is Freeciv the same as Civilization?",
        a: "No. It is inspired by the Civilization series and implements similar empire-building, but it is an independent project with its own rulesets, clients, and multiplayer culture.",
      },
      {
        q: "Can I play Freeciv online?",
        a: "Yes. There are public servers, Longturn games, and you can host your own. PlayBound lists Freeciv server activity where a provider is wired up.",
      },
      {
        q: "Does Freeciv have single-player?",
        a: "Yes. You can play against AI, including hotseat. Multiplayer is a big part of the community, but you never have to go online.",
      },
      {
        q: "Which Freeciv client should I use?",
        a: "The Windows package PlayBound installs is the GTK4 client. Qt is also common. Use whichever your package provides; the ruleset matters more than the toolkit.",
      },
    ],
  },

  openciv3: {
    qualityBar: {
      genuinelyFree: true,
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: false,
      verdict:
        "OpenCiv3 is a genuine open-source Civ III remake in progress: playable standalone with placeholder art, better with a legal Civilization III Complete install, and not a finished commercial-quality 4X yet.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "OpenCiv3 (the project formerly called C7) is an attempt to rebuild Civilization III in Godot so the game can live on modern machines and, eventually, under a licence that is not locked to 2001 installers. It already runs without owning Civ III: you get placeholder art and a rules sandbox. If you do own Civilization III Complete on Steam or GOG, OpenCiv3 can pick up the original graphics from common install paths.\n\nThat split is the honest product. This is not a polished Definitive Edition. It is a remake with a public GitHub, a roadmap, and the kind of missing edges you expect from an early Godot port of a deep 4X. Combat, civilopedia coverage, and UI will feel unfinished next to Firaxis’s later games — and next to Civ III itself on a good day.\n\nWe list it anyway because the alternative for Civ III on a modern PC is often compatibility theatre. OpenCiv3 is the project that is trying to make the design portable. If you want a finished free 4X tonight, play Freeciv. If you want to follow a Civ III remake and maybe feed it original art you already paid for, this is the page.",
    whyWePickedIt:
      "Civilization III still has a design worth preserving, and OpenCiv3 is the open remake actually shipping builds. We would rather catalog an honest work-in-progress than pretend shareware clones are the same game.",
    bestFor: [
      "Civilization III fans who want a modern, open client",
      "People who already own Civ III Complete and want original art",
      "Modders watching a Godot 4X remake take shape",
      "Players who accept placeholder art in a standalone build",
    ],
    notFor: [
      "You want a finished, campaign-complete 4X this weekend",
      "You expected Firaxis-level UI and civilopedia depth today",
      "You refuse to install a separate game for original graphics",
      "You wanted Freeciv’s thirty-year ruleset stability under another name",
    ],
    comparableTo: ["Civilization III", "Freeciv", "Civilization II", "Call to Power"],
    installSteps: [
      {
        platform: "all",
        text: "Install OpenCiv3 with the PlayBound launcher. The Windows zip from the C7-Game/OpenCiv3 GitHub releases runs standalone with placeholder art.",
      },
      {
        platform: "windows",
        text: "Launch OpenCiv3 and confirm it windowed. If you own Civilization III Complete, keep that install in a normal Steam or GOG folder so OpenCiv3 can detect original graphics.",
      },
      {
        platform: "all",
        text: "This is an early remake. Read the GitHub readme for known gaps before judging it as a finished Civ III replacement.",
      },
    ],
    faq: [
      {
        q: "Do I need Civilization III to play OpenCiv3?",
        a: "No. OpenCiv3 runs standalone with placeholder art. A legal Civilization III Complete install is optional and unlocks original graphics when the remake finds it.",
      },
      {
        q: "Is OpenCiv3 finished?",
        a: "No. It is an actively developed remake. Core loops exist; presentation, completeness, and polish are still behind Civilization III itself.",
      },
      {
        q: "Is OpenCiv3 legal?",
        a: "The engine is an open-source remake. Original Civ III art is still Firaxis/2K property — only use it if you own a legal copy. Placeholder art needs no extra purchase.",
      },
      {
        q: "How is OpenCiv3 different from Freeciv?",
        a: "Freeciv is a mature Civilization-inspired 4X with its own rulesets. OpenCiv3 specifically targets Civilization III’s design and assets. They scratch adjacent itches, not the same one.",
      },
      {
        q: "Where do OpenCiv3 builds come from?",
        a: "Official Windows zips are published on the C7-Game/OpenCiv3 GitHub releases page. PlayBound installs that project, not a third-party fork.",
      },
    ],
  },

  "asphalt-legends": {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Asphalt Legends is a finished, actively updated arcade racer you can play without paying up front, but it is a free-to-play live-service with a prominent shop — not a no-monetisation catalog pick.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Asphalt Legends (the PC continuation of Gameloft’s Asphalt arcade line, including the Unite branding) is a licensed-car racer built for short races, nitro, and a garage that never really stops expanding. On PC it is a free Steam/Epic download with controller support and the same live-service loop the mobile games taught a huge audience: race, upgrade, chase events, bump into the shop.\n\nIt is not sim racing. Steering is arcade, tracks are showpieces, and the fantasy is driving cars you will not own. That fantasy is funded by optional spending. You can play without paying; you cannot pretend the economy is a museum piece. If PlayBound’s five-point bar is a filter against pay-to-win treadmills, this title fails the ‘genuinely free’ criterion on purpose — we still list it because people search for a free arcade racer on PC and deserve an honest page rather than a silent omission.\n\nInstall through Steam when you can. The client wants DirectX 12, a 64-bit Windows 10 machine, and a network connection. Solo events and versus-AI exist; the live calendar is the real structure of the game.",
    whyWePickedIt:
      "It is the mainstream free arcade racer on PC. Cataloguing it with an honest quality bar is more useful than pretending the only free racers are open-source kart games.",
    bestFor: [
      "Arcade racers who want licensed cars and short events",
      "Controller play on a mid-range PC or Steam Deck-class handheld",
      "Players who already know Asphalt from mobile",
      "People who will ignore the shop and just race",
    ],
    notFor: [
      "You want a sim with tyre models and no nitro",
      "You want a game with no live-service shop or seasonal grind",
      "You are offline for long stretches",
      "You expected an open-source racing project",
    ],
    comparableTo: ["Need for Speed", "Asphalt 8", "Asphalt 9", "Mario Kart"],
    installSteps: [
      {
        platform: "all",
        text: "The straightforward PC install is Steam: add Asphalt Legends (free) and let Steam keep it updated. Epic also lists the game.",
      },
      {
        platform: "windows",
        text: "Launch from Steam, sign in with a Gameloft account if prompted, and complete the download. A controller is optional but better than keyboard for arcade racing.",
      },
      {
        platform: "all",
        text: "This is a live-service racer. Expect a shop and events. You can race without paying; skip the store if that is why you are here.",
      },
    ],
    faq: [
      {
        q: "Is Asphalt Legends free?",
        a: "It is free to download and race. Optional real-money purchases exist for cars, packs, and battle passes. You do not have to spend, but the shop is part of the design.",
      },
      {
        q: "Is Asphalt Legends the same as Asphalt Legends Unite?",
        a: "Unite was the live-service name on PC and consoles. Store pages now often say Asphalt Legends. PlayBound keeps the catalog slug asphalt-legends and treats Unite as an alias.",
      },
      {
        q: "Does Asphalt Legends work offline?",
        a: "It expects a broadband connection. Treat it as an online live-service, not a LAN kart racer.",
      },
      {
        q: "Can I play Asphalt Legends with a controller?",
        a: "Yes. Controllers are supported and are the better way to play on PC.",
      },
      {
        q: "Is there a single-player mode?",
        a: "Yes. Career-style and versus-AI events exist alongside multiplayer. The calendar of limited events is still the live-service spine.",
      },
    ],
  },

  "tinywind-pixel-pirate-sailing-game": {
    qualityBar: {
      genuinelyFree: true,
      finished: false,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "TinyWind is a genuinely free-to-play-in-browser pirate sailing roguelite with real wind physics and an active solo developer — early, not finished, and not a live-service cash shop.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "TinyWind looks like a cute pixel boat and then asks you to sail it properly. Wind is not a decoration: points of sail, apparent wind, and the difference between reaching and running show up in a tiny sprite. Voyages are short roguelite runs — British waters, Spanish waters, treasures with encyclopaedia links, the occasional mythic pet — rather than an open-world pirate MMO.\n\nToday the honest way to play is in the browser at tinywind.io (also listed on itch). A Steam Early Access build is planned; until that ships, PlayBound treats this as a browser game, not a desktop installer. Progress may ask you to register. That is friction, not a gacha window.\n\nIt is early. Modes are still landing. Art is modest. The reason it is in the catalog is that the sailing model is more interesting than ninety percent of ‘click to pirate’ games, and you can try it without paying. If you wanted Sea of Thieves with a crew of five, this is not that. If you wanted ten-minute voyages that actually care about the wind, it is.",
    whyWePickedIt:
      "Free pirate games usually fake the water. TinyWind models the wind well enough that a short browser run feels like sailing, and that is rare enough to list while it is still early.",
    bestFor: [
      "Short pirate voyages in a browser",
      "People who like wind, trim, and points of sail even in pixel art",
      "Roguelite runs rather than a persistent MMO sandbox",
      "Players who will give an early solo-dev game some slack",
    ],
    notFor: [
      "You want a finished 1.0 Steam product today",
      "You want a large-crew social pirate MMO",
      "You refuse to create an account to save progress",
      "You expected a downloaded Windows installer from PlayBound",
    ],
    comparableTo: ["Windward", "Sea of Thieves", "Pixel Piracy", "Sid Meier's Pirates!"],
    installSteps: [
      {
        platform: "all",
        text: "TinyWind plays in your browser. Open https://tinywind.io (or the itch.io page) and start a voyage — there is no PlayBound desktop installer yet.",
      },
      {
        platform: "all",
        text: "Create an account if you want progress saved. Keyboard and touch both work; a Steam build with extra platform support is planned, not required to try the game.",
      },
    ],
    faq: [
      {
        q: "Is TinyWind free?",
        a: "The current browser game is free to play. A paid Steam Early Access build is planned. There is no mobile-style gacha attached to the browser client we are describing.",
      },
      {
        q: "Can I install TinyWind on Windows?",
        a: "Not as a PlayBound launcher title yet. Play it in the browser. Wishlist Steam app 4827130 if you want a future desktop build.",
      },
      {
        q: "Is TinyWind finished?",
        a: "No. It is early and still adding modes. The sailing model is already the reason to try it.",
      },
      {
        q: "Does TinyWind have multiplayer?",
        a: "There is a live world with other captains and ranked/ladder features in development. You can still treat a voyage as a short solo run.",
      },
      {
        q: "Why is this in a catalog of installable games?",
        a: "Because people already look for it on PlayBound, it is free to try, and the honest install path today is the official site — not a third-party zip.",
      },
    ],
  },

  warframe: {
    qualityBar: {
      genuinelyFree: false,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Warframe is a huge, well-made co-op shooter you can play without paying, but Platinum, a cosmetic treadmill, and a dense living economy mean it fails a strict ‘genuinely free’ test.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Warframe is Digital Extremes’ long-running free-to-play looter shooter: space ninja frames, parkour, guns that turn into melee, and a solar map that has been added to for more than a decade. You can play the whole way as a solo player — the game even has an official Solo matchmaking setting — or run squads of four through the same nodes.\n\nIt is generous for a live-service shooter and it is still a live-service shooter. Platinum buys cosmetics and convenience. Founders and deluxe skins exist. The foundry, mods, and Prime vaults are a second game about logistics. None of that makes the shooting bad. It does mean PlayBound will not stamp genuinelyFree on it.\n\nThe Windows client is a substantial download. Official installers come from Warframe.com (MSI) or Steam. PlayBound will not send you to a random ‘free Warframe’ zip. New players should expect a busy UI and a wiki tab. The payoff is one of the few F2P action games that still feels like a crafted co-op shooter rather than a battle-pass template.",
    whyWePickedIt:
      "If someone asks for a free co-op shooter that is actually large, Warframe is the honest answer — with the cash shop named in the assessment instead of hidden behind a slogan.",
    bestFor: [
      "Co-op looter-shooter players who like movement tech",
      "People willing to learn a dense UI and a long quest list",
      "Solo players who will use the official Solo setting",
      "Anyone who wants a huge free download rather than a 200 MB indie",
    ],
    notFor: [
      "You want a campaign with no live-service economy",
      "You refuse any cosmetic shop on principle",
      "You wanted a tiny install and a ten-minute tutorial",
      "You expected an open-source game",
    ],
    comparableTo: ["Destiny 2", "The Division", "Anthem", "Monster Hunter"],
    installSteps: [
      {
        platform: "all",
        text: "Install Warframe from the official site (Warframe.msi) or add the free Steam app. Do not download ‘cracked’ or third-party clients.",
      },
      {
        platform: "windows",
        text: "Run the installer or Steam, let the launcher finish the large content download, then create a Digital Extremes account if you do not have one.",
      },
      {
        platform: "all",
        text: "On first launch, complete the opening quests before shopping. Use Solo matchmaking if you want to play the star chart without a squad.",
      },
    ],
    faq: [
      {
        q: "Is Warframe free?",
        a: "It is free to download and play. Platinum and a large cosmetic/convenience shop exist. You can progress without paying; you will see the shop.",
      },
      {
        q: "Can I play Warframe solo?",
        a: "Yes. Digital Extremes ships an official Solo matchmaking option. Some content is easier in a squad, but the game is not raid-gated at the start.",
      },
      {
        q: "How big is Warframe?",
        a: "Plan on tens of gigabytes. The launcher download is much larger than a typical open-source catalog title.",
      },
      {
        q: "Should I use Steam or the standalone installer?",
        a: "Either official path is fine. Steam is simpler if you already live there. The standalone MSI from warframe.com is the other supported client.",
      },
      {
        q: "Is Warframe on PlayBound an open-source game?",
        a: "No. It is a commercial live-service title listed so free-to-play PC games have accurate pages, not because it matches the FOSS quality bar.",
      },
    ],
  },

  "mega-man-unlimited": {
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: false,
      standsAlone: true,
      highQuality: true,
      verdict:
        "Mega Man Unlimited is a complete, free NES-style fangame with no shop — unofficial Capcom fan work, last shipped as a finished 2013 build rather than an actively patched live service.",
      lastVerified: "2026-08-13",
    },
    longDescription:
      "Mega Man Unlimited is MegaPhilX’s 2013 tribute to classic Mega Man: eight Robot Masters, original weapons, extra stages, and challenge modes that go well past a weekend ROM hack. It plays like the NES games on purpose — run, jump, learn a pattern, swap a weapon you earned fairly. There is no battle pass. There is no ‘energy tank microtransaction’.\n\nIt is also a fangame. Capcom did not publish it. PlayBound will not pretend it is Mega Man 11, and we will not host the zip. You download it from the creator’s site (megaphilx.com) and you should understand you are playing unofficial fan work that uses the feel of a commercial series.\n\nDevelopment on Unlimited itself is historical at this point; the 1.3.1 build is the one people mean. If you want an officially licensed Mega Man, buy one from Capcom. If you want a free, complete, brutally fair NES-style campaign that the fan community still points at, this is that game — downloaded from the author, not from a random aggregator.",
    whyWePickedIt:
      "It is one of the few Mega Man fangames that feels like a full numbered entry, it costs nothing, and the honest download is still the creator’s own site.",
    bestFor: [
      "Classic Mega Man fans who want another full eight-robot campaign",
      "Players who like NES difficulty with modern quality-of-life options",
      "People willing to download unofficial fan games from the author",
      "Challenge-mode completionists",
    ],
    notFor: [
      "You only play officially licensed Capcom releases",
      "You want a 2026 live-service with patches every season",
      "You need Steam achievements and cloud saves",
      "You wanted Mega Man X movement rather than classic NES physics",
    ],
    comparableTo: ["Mega Man 9", "Mega Man 10", "Mega Man 11", "Mighty No. 9"],
    installSteps: [
      {
        platform: "all",
        text: "Download Mega Man Unlimited only from the creator’s site at megaphilx.com (the Unlimited game page). Do not use random ‘mega man unlimited free’ file hosts.",
      },
      {
        platform: "windows",
        text: "Unzip the 1.3.1 build and run the game executable. If you use an Xbox controller, the author provides an options file to drop in the game folder.",
      },
      {
        platform: "all",
        text: "This is unofficial fan software, not a Capcom product. Start on Easy if you are rusty; Original is the NES-style default.",
      },
    ],
    faq: [
      {
        q: "Is Mega Man Unlimited official?",
        a: "No. It is a fan game by MegaPhilX. Capcom did not publish it. Buy official Mega Man titles if you want a licensed product.",
      },
      {
        q: "Is Mega Man Unlimited free?",
        a: "Yes. The author distributes it without a store. Download it from megaphilx.com rather than a third-party mirror.",
      },
      {
        q: "Does PlayBound install Mega Man Unlimited for me?",
        a: "No. The launcher recipe is an external link to the official fan page. We do not redistribute the zip.",
      },
      {
        q: "Is it still updated?",
        a: "The widely played build is 1.3.1 from the 2010s. Treat it as a finished fangame, not a live-service with weekly patches.",
      },
      {
        q: "Can I play as anyone besides Mega Man?",
        a: "There is a second playable character unlocked by finishing Original mode, plus extra challenge modes after the main campaign.",
      },
    ],
  },
  holocure: {
    qualityBar: clearsAll(
      "HoloCure clears all quality criteria: completely free with zero microtransactions, exceptionally high polish, deep mechanical and buildcrafting complexity, actively updated, and runs flawlessly on low-spec hardware and Steam Deck."
    ),
    longDescription:
      "HoloCure — Save the Fans! is one of the most mechanically inventive and content-rich bullet-heaven roguelites on PC. Created independently by lead animator and developer Kay Yu, the game began as a passionate tribute to Hololive talent and quickly exploded into a genre landmark with tens of thousands of Overwhelmingly Positive community reviews.\n\nBeneath its vibrant, hand-crafted pixel art lies an enormous amount of mechanical depth. Unlike conventional auto-shooters where characters are largely cosmetic stat skins, HoloCure boasts 47 completely distinct playable idols across Hololive English, Japan, and Indonesia branches. Every single character arrives with their own signature starting weapon, three unique passive skills that fundamentally reshape your survival strategy, and a dedicated Special Attack featuring bespoke animations and screen-clearing effects.\n\nBuildcrafting is where HoloCure truly shines. As swarms of mind-controlled fans close in across sprawling stages, players level up a vast arsenal of offensive weapons and passive utility items. Maxing out complementary weapons allows you to forge devastating Collab weapons at the Golden Anvil. Late in a run, Collabs can be elevated further into Super Collabs—such as Blood Lust, Black Plague, and True Infinite BL Works—transforming a modest attack pattern into an unstoppable, room-sweeping fireworks display.\n\nCustomization expands even deeper through the Stamp system. Up to three of the 22 collectible Stamps can be socketed directly onto your character's primary weapon, altering projectile trajectories, attack speed, critical burst damage, knockback force, or area spread. Combined with support items and stat prisms, no two runs ever feel identical.\n\nCrucially, HoloCure is built with a strictly zero-monetization philosophy. There are no microtransactions, premium currencies, battle passes, or paid shortcuts. The in-game character gacha and permanent stat shop are funded entirely through HoloCoins earned by playing—clearing waves, smashing Holozon crates, and defeating stage bosses. Every character, upgrade, and cosmetic unlock is 100% gameplay-funded.\n\nWhen you need a breather from intense combat runs, HoloCure provides an entire secondary simulation mode called Holo House. Here, players can customize and decorate their home, cultivate crops, fish in serene ponds, cook stat-boosting recipes, recruit and interact with characters, scale the challenging Tower of Suffering, or test their luck with minigames in the Usada Casino.\n\nWhether chasing competitive leaderboards in the standardized Time Attack mode (racing to rescue 4,000 fans), surviving deep into Endless Mode, or exploring hundreds of weapon combinations on handheld PCs and Steam Deck, HoloCure delivers a premier, endlessly replayable action experience that costs absolutely nothing.",
    bestFor: [
      "Fans of Vampire Survivors looking for much deeper character buildcrafting, weapon synergies, and super collabs",
      "Players who love permanent progression and minigames (farming, fishing, housing, casino) alongside compact 20-minute action runs",
      "Handheld PC and controller players wanting a lightweight, highly responsive pixel-art bullet heaven with zero microtransactions",
      "Gamers seeking massive replayability across 47 uniquely designed characters with distinct playstyles",
    ],
    notFor: [
      "Players looking for official built-in online multiplayer out of the box (the vanilla game is strictly single-player)",
      "Anyone expecting native mobile (Android/iOS) support—HoloCure is strictly a Windows PC game",
      "Those seeking realistic 3D AAA graphics rather than polished, vibrant 2D pixel art",
    ],
    comparableTo: [
      "Vampire Survivors",
      "Magic Survival",
      "Brotato",
      "Death Must Die",
      "20 Minutes Till Dawn",
    ],
    installSteps: [
      {
        platform: "windows",
        text: "Click 'Install with PlayBound Launcher' or download the standalone archive directly from the official itch.io / Steam distribution.",
      },
      {
        platform: "windows",
        text: "Extract or install the game to your preferred PC directory. The game runs natively on 64-bit Windows without third-party runtimes.",
      },
      {
        platform: "all",
        text: "Launch the game and configure your preferred input method. While full keyboard controls are supported, playing with an Xbox, PlayStation, or 8BitDo controller is strongly recommended.",
      },
    ],
    faq: [
      {
        q: "Is HoloCure completely free or does it have microtransactions?",
        a: "HoloCure is 100% free with absolutely zero monetization or microtransactions. The in-game character gacha and shop upgrades use HoloCoins earned strictly through regular gameplay.",
      },
      {
        q: "Can I play HoloCure with a controller or on Steam Deck?",
        a: "Yes. The developers officially recommend playing with a controller (Xbox, PlayStation, 8BitDo, etc.). The game is also marked as Playable on Steam Deck and runs exceptionally well on handheld PCs.",
      },
      {
        q: "Does HoloCure have multiplayer?",
        a: "The official vanilla game is strictly single-player. While community members have developed unofficial multiplayer and sandbox mods using tools like YYToolkit, the base game contains no official online co-op.",
      },
      {
        q: "What is Holo House?",
        a: "Holo House is a massive secondary life-sim mode within HoloCure where you can decorate your home, cultivate crops, fish, cook recipes, interact with characters, and play minigames at the Usada Casino.",
      },
      {
        q: "How do Collabs and Super Collabs work?",
        a: "By maxing out two compatible base weapons, you can combine them using a Golden Anvil to create a powerful Collab weapon. Fusing a Collab with a specific maxed item creates a screen-clearing Super Collab.",
      },
      {
        q: "Is HoloCure an official Hololive product?",
        a: "No. HoloCure is an unofficial fan game created by Kay Yu under Cover Corp's Hololive Derivative Works Guidelines, featuring original artwork and custom soundtrack remixes by Eufrik.",
      },
    ],
  },
};

/** Merge editorial content onto a factual catalog entry. */
export function withEditorial(game: Game): Game {
  const extra = editorial[game.slug];
  return extra ? { ...game, ...extra } : game;
}
