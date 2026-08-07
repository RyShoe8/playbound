/**
 * Catalog additions — wave 3.
 *
 * Same contract as the earlier catalog-add scripts: INSERT-ONLY (an existing
 * slug is left completely alone), games land as drafts, mods are published.
 * Wired into the build chain the same way — this file's own npm script runs
 * with --apply --soft-fail on every deploy, and once every slug below exists
 * in production this script (and its npm scripts) should be deleted the same
 * way waves 1 and 2 were.
 *
 * This batch is mostly mobile-first titles. Where a game also has a Steam
 * listing, launcherInstall stays "external" pointing at Steam for the same
 * reason as wave 2: none of the found direct installers can be reliably
 * detected as "installed" by the launcher without a verified install path.
 * Where a game has no PC platform at all, launcherInstall is left null —
 * androidStoreUrl/iosStoreUrl alone are enough for deriveVirtualEdition() in
 * src/lib/editions.ts to route the game page to "Get on Google Play" / "Get
 * on the App Store".
 *
 * Two things worth flagging from this list:
 *
 *   - "Asphalt Legends Unite" is not a separate game — its Steam page
 *     (appid 1815780) and its Google Play listing (com.gameloft.android.
 *     ANMP.GloftA9HM) both currently read "Asphalt Legends" with no "Unite"
 *     in the name, and that's the exact same Steam appid and Android
 *     package already seeded under the `asphalt-legends` slug in wave 2.
 *     Adding it again here would have produced a duplicate game record for
 *     the same title, so it's left out. If it should carry "Unite" as an
 *     alias on the existing record, that needs a one-off admin edit or a
 *     dedicated patch script — this insert-only script can't touch a slug
 *     that already exists.
 *   - "Data Wing" was listed twice in the request; it appears once here.
 *
 * Usage:
 *   npx tsx scripts/add-games-wave-3.ts                       # dry run
 *   npx tsx scripts/add-games-wave-3.ts --apply
 *   npx tsx scripts/add-games-wave-3.ts --apply --soft-fail   # the build
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type DeveloperSeed = {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  founded: number;
  location: string;
  website: string;
  artHue: number;
  published: boolean;
};

const DEVELOPERS: DeveloperSeed[] = [
  {
    slug: "digital-extremes",
    name: "Digital Extremes",
    tagline: "Developer of Warframe and Warframe Mobile.",
    about: "Studio behind the Warframe franchise, including its dedicated mobile client.",
    founded: 0,
    location: "London, Canada",
    website: "https://www.digitalextremes.com",
    artHue: 190,
    published: true,
  },
  {
    slug: "activision-publishing",
    name: "Activision Publishing, Inc.",
    tagline: "Developer/publisher of Call of Duty: Mobile.",
    about: "Publisher behind the Call of Duty franchise's dedicated mobile entry.",
    founded: 0,
    location: "Santa Monica, California",
    website: "https://www.callofduty.com/mobile",
    artHue: 30,
    published: true,
  },
  {
    slug: "riot-games",
    name: "Riot Games",
    tagline: "Developer of League of Legends: Wild Rift.",
    about: "Studio behind the League of Legends franchise, including its mobile/console entry Wild Rift.",
    founded: 0,
    location: "Los Angeles, California",
    website: "https://www.riotgames.com",
    artHue: 205,
    published: true,
  },
  {
    slug: "blue-mammoth-games",
    name: "Blue Mammoth Games",
    tagline: "Developer of Brawlhalla, published by Ubisoft.",
    about: "Studio behind Brawlhalla, a cross-platform platform fighter.",
    founded: 0,
    location: "Miami, Florida",
    website: "https://www.brawlhalla.com",
    artHue: 260,
    published: true,
  },
  {
    slug: "mad-otter-games",
    name: "Mad Otter Games",
    tagline: "Developer of Villagers & Heroes.",
    about: "Studio behind Villagers & Heroes, a cross-platform fantasy MMO playable on PC and mobile with one account.",
    founded: 0,
    location: "United States",
    website: "https://villagersandheroes.com",
    artHue: 145,
    published: true,
  },
  {
    slug: "second-dinner",
    name: "Second Dinner Studios",
    tagline: "Developer of MARVEL SNAP.",
    about: "Studio founded by former Hearthstone leads, behind the fast-paced card game MARVEL SNAP.",
    founded: 0,
    location: "Irvine, California",
    website: "https://marvelsnap.com",
    artHue: 0,
    published: true,
  },
  {
    slug: "ballistica",
    name: "Eric Froemling",
    tagline: "Solo developer of BombSquad, published as Ballistica.",
    about: "Independent developer behind BombSquad, a local/online multiplayer party brawler running since 2011.",
    founded: 0,
    location: "United States",
    website: "https://ballistica.net",
    artHue: 15,
    published: true,
  },
  {
    slug: "innersloth",
    name: "Innersloth",
    tagline: "Developer of Among Us and The Henry Stickmin Collection.",
    about: "Small studio behind Among Us, the social deduction game that became a cultural phenomenon in 2020.",
    founded: 0,
    location: "Redmond, Washington",
    website: "https://www.innersloth.com",
    artHue: 350,
    published: true,
  },
  {
    slug: "daniel-vogt",
    name: "Daniel Vogt",
    tagline: "Solo developer of Data Wing.",
    about: "Independent developer behind Data Wing, a fast top-down arcade flyer.",
    founded: 0,
    location: "Unknown",
    website: "https://apps.apple.com/us/app/data-wing/id1206723870",
    artHue: 200,
    published: true,
  },
  {
    slug: "fancade",
    name: "Fancade AB",
    tagline: "Current publisher of Mekorama, originally made by Martin Magni.",
    about: "Studio now publishing Mekorama, the isometric block-puzzle game originally released solo by Martin Magni.",
    founded: 0,
    location: "Sweden",
    website: "https://www.mekorama.com",
    artHue: 260,
    published: true,
  },
];

const GAMES = [
  {
    slug: "warframe-mobile",
    title: "Warframe Mobile",
    tagline: "Digital Extremes' third-person sci-fi shooter, built natively for phones.",
    description:
      "A ground-up mobile client for Warframe rather than a port: the same Warframes, weapons and space-ninja combat as the PC/console game, rebuilt for touch controls, with cross-save carrying progress across platforms. Missions are trimmed to mobile session lengths without losing the movement-heavy parkour combat the series is known for.",
    developerSlug: "digital-extremes",
    developerName: "Digital Extremes",
    genres: ["Action", "Shooter"],
    tags: ["Sci-Fi", "Third-Person Shooter", "Cross-Platform"],
    aliases: [],
    license: "Free to Play",
    releaseYear: 2024,
    sizeMB: 3957,
    platforms: ["Android", "iOS"],
    features: ["Multiplayer", "Co-op", "Cross-play"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://www.warframe.com/",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.digitalextremes.warframemobile",
    iosStoreUrl: "https://apps.apple.com/us/app/warframe/id1520001008",
    art: { from: "#0c4a6e", to: "#22d3ee", icon: "Crosshair" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/230410/header.jpg",
    systemRequirements: {
      min: "iOS 14.0 or later, or Android 8.0 or later. See app store listing for device-specific requirements.",
      recommended: "iOS 14.0 or later, or Android 8.0 or later. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "call-of-duty-mobile",
    title: "Call of Duty: Mobile",
    tagline: "A full Call of Duty package rebuilt for touch, with maps and modes pulled from across the series.",
    description:
      "A standalone Call of Duty entry built for phones, mixing classic multiplayer maps and modes lifted from across the series with its own battle royale mode. Weapon progression, seasons and a battle pass run on the same live-service cadence as the console games, just tuned for shorter mobile sessions.",
    developerSlug: "activision-publishing",
    developerName: "Activision Publishing, Inc.",
    genres: ["FPS", "Shooter"],
    tags: ["Battle Royale", "Competitive", "Multiplayer"],
    aliases: ["COD Mobile", "CODM"],
    license: "Free to Play",
    releaseYear: 2019,
    sizeMB: 2839,
    platforms: ["Android", "iOS"],
    features: ["Multiplayer", "Controller Support", "Cross-play"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://www.callofduty.com/mobile",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.activision.callofduty.shooter",
    iosStoreUrl: "https://apps.apple.com/us/app/call-of-duty-mobile/id1287282214",
    art: { from: "#1c1917", to: "#f97316", icon: "Crosshair" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2000950/header.jpg",
    systemRequirements: {
      min: "iOS 15.0 or later, or Android 6.0 or later. See app store listing for device-specific requirements.",
      recommended: "iOS 15.0 or later, or Android 6.0 or later. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "wild-rift",
    title: "League of Legends: Wild Rift",
    tagline: "League of Legends rebuilt from scratch for shorter matches on mobile and console.",
    description:
      "Not a port of League of Legends but a from-scratch rebuild on a new engine, with matches trimmed to roughly twenty minutes and controls redesigned for touch and controller. A reworked roster of champions, items and runes keeps the same 5v5 lane-and-jungle structure while dropping the parts that don't survive the move to a shorter session.",
    developerSlug: "riot-games",
    developerName: "Riot Games",
    genres: ["MOBA"],
    tags: ["Team Based", "Competitive", "Multiplayer"],
    aliases: ["LoL: Wild Rift", "WR"],
    license: "Free to Play",
    releaseYear: 2021,
    sizeMB: 1098,
    platforms: ["Android", "iOS"],
    features: ["Multiplayer", "Ranked Ladder", "Controller Support"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://wildrift.leagueoflegends.com/en-us/",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.riotgames.league.wildrift",
    iosStoreUrl: "https://apps.apple.com/us/app/league-of-legends-wild-rift/id1480616990",
    art: { from: "#0c2340", to: "#c8aa6e", icon: "Swords" },
    systemRequirements: {
      min: "iOS 15.0 or later, or Android 6.0 or later. See app store listing for device-specific requirements.",
      recommended: "iOS 15.0 or later, or Android 6.0 or later. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "brawlhalla",
    title: "Brawlhalla",
    tagline: "A free platform fighter for up to eight players, cross-play across nearly everything.",
    description:
      "A platform fighter in the Smash mould, built free-to-play from day one with cosmetic-only monetization and a roster past sixty Legends. Cross-play spans PlayStation, Xbox, Switch, iOS, Android and Steam under one player base, and casual free-for-alls sit alongside a full ranked ladder for players who want it.",
    developerSlug: "blue-mammoth-games",
    developerName: "Blue Mammoth Games",
    genres: ["Fighting"],
    tags: ["Platform Fighter", "Cross-Platform", "Competitive"],
    aliases: [],
    license: "Free to Play",
    releaseYear: 2017,
    sizeMB: 800,
    platforms: ["Windows", "macOS", "Android", "iOS"],
    features: ["Multiplayer", "Co-op", "Split-Screen Co-op", "Cross-play", "Controller Support"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://www.brawlhalla.com",
    steamAppId: "291550",
    androidStoreUrl:
      "https://play.google.com/store/apps/details?id=air.com.ubisoft.brawl.halla.platform.fighting.action.pvp",
    iosStoreUrl: "https://apps.apple.com/us/app/brawlhalla/id1491520571",
    art: { from: "#312e81", to: "#facc15", icon: "Swords" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/291550/2db0e0cc21262d6a7da18db928b8c374521b4463/header_alt_assets_10.jpg",
    screenshots: ["https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/291550/3fb9b4e90993f69dcdb83fd10d7140d3c67f048f/ss_3fb9b4e90993f69dcdb83fd10d7140d3c67f048f.1920x1080.jpg"],
    systemRequirements: {
      min: "2 GB RAM, 800 MB storage (Windows or macOS). iOS 15.0+ / Android 5.0+ on mobile.",
      recommended: "4 GB RAM, 2 GB storage, broadband connection (Windows or macOS).",
    },
    launcherInstall: {
      enabled: true,
      kind: "external",
      url: "https://store.steampowered.com/app/291550/",
      note: "Free to play on Steam — Steam handles the download and install. Also available on Google Play and the App Store.",
    },
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "villagers-and-heroes",
    title: "Villagers & Heroes",
    tagline: "A fantasy MMO with one account and one character across PC and mobile.",
    description:
      "A cross-platform fantasy MMORPG where the same account and character follow you between PC and mobile — log in on a phone mid-session and pick up exactly where the desktop client left off. A large explorable world, class-based combat and a long-running crafting economy sit behind the usual free-to-play trappings.",
    developerSlug: "mad-otter-games",
    developerName: "Mad Otter Games",
    genres: ["MMO", "RPG"],
    tags: ["Fantasy", "Cross-Platform", "Casual MMO"],
    aliases: ["V&H"],
    license: "Free to Play",
    releaseYear: 2014,
    sizeMB: 3000,
    platforms: ["Windows", "Android", "iOS"],
    features: ["Multiplayer", "Co-op", "Cross-play"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://villagersandheroes.com/",
    steamAppId: "263540",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.madotter.vhmmo",
    iosStoreUrl: "https://apps.apple.com/us/app/villagers-heroes/id1183113853",
    art: { from: "#166534", to: "#bef264", icon: "Swords" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/263540/header.jpg",
    screenshots: ["https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/263540/ss_6259b232fe5da1fbbe35ca8bf8a57e53c27ce7e8.1920x1080.jpg"],
    systemRequirements: {
      min: "Windows 10/8/7/Vista/XP, Pentium D or Athlon 64 X2, 2 GB RAM, onboard graphics, DirectX 9.0, 3 GB storage.",
      recommended: "Windows 10/8/7, Core 2 Duo 2.2GHz or Athlon 64 X2 2.6GHz, 4 GB RAM, 512 MB graphics card, DirectX 9.0, 3 GB storage.",
    },
    launcherInstall: {
      enabled: true,
      kind: "external",
      url: "https://store.steampowered.com/app/263540/",
      note: "Free to play on Steam — Steam handles the download and install. Also available on Google Play and the App Store, sharing the same account.",
    },
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "marvel-snap",
    title: "MARVEL SNAP",
    tagline: "A fast, high-stakes card game built around six-minute matches.",
    description:
      "A collectible card game from former Hearthstone leads, built specifically to be fast: matches run about six minutes, decks are twelve cards, and a mid-game \"Snap\" mechanic lets either player double the stakes instead of waiting for a slow grind to a natural end. Marvel's roster provides the cast, but the pace is the pitch.",
    developerSlug: "second-dinner",
    developerName: "Second Dinner Studios",
    genres: ["Card Game"],
    tags: ["Deck Building", "Quick Matches", "Competitive"],
    aliases: ["Snap"],
    license: "Free to Play",
    releaseYear: 2022,
    sizeMB: 8000,
    platforms: ["Windows", "Android", "iOS"],
    features: ["Multiplayer", "Cross-play"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://marvelsnap.com",
    steamAppId: "1997040",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.nvsgames.snap",
    iosStoreUrl: "https://apps.apple.com/us/app/marvel-snap-hero-card-game/id1592081003",
    art: { from: "#7f1d1d", to: "#facc15", icon: "Zap" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/47bfae67977f349b56d1cfdceba9e6f9f9f4951e/header.jpg",
    screenshots: ["https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/7f1670ed0cc90cb56894f0652c7185b2f87d18a5/ss_7f1670ed0cc90cb56894f0652c7185b2f87d18a5.1920x1080.jpg"],
    systemRequirements: {
      min: "Windows 10, Intel Core i5-650 or AMD Phenom II X4 965, 4 GB RAM, GeForce GTX 650 / Radeon HD 6950, DirectX 10, 8 GB storage.",
      recommended: "Windows 10, Intel Core i5-2300 or AMD FX-6300, 4 GB RAM, GeForce GTX 660 / Radeon HD 7970, DirectX 10, 8 GB storage.",
    },
    launcherInstall: {
      enabled: true,
      kind: "external",
      url: "https://store.steampowered.com/app/1997040/",
      note: "Free to play on Steam — Steam handles the download and install. Also available on Google Play and the App Store, sharing progress via account login.",
    },
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "bombsquad",
    title: "BombSquad",
    tagline: "A chaotic local/online party brawler about blowing up your friends.",
    description:
      "A physics-driven party game for up to eight players, local or online, where the goal boils down to putting bombs near your friends before they do it to you. Running since 2011 as an indie one-person project, it's stayed free with cosmetic-only monetization and a long list of community-made mini-games and mods on top of the core brawl.",
    developerSlug: "ballistica",
    developerName: "Eric Froemling",
    genres: ["Action", "Arcade"],
    tags: ["Party", "Local Multiplayer", "Chaos"],
    aliases: ["Ballistica"],
    license: "Free to Play",
    releaseYear: 2011,
    sizeMB: 66,
    platforms: ["Windows", "macOS", "Linux", "Android"],
    features: ["Multiplayer", "Co-op", "Split-Screen Co-op", "LAN Support", "Controller Support", "Mod Support"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://ballistica.net",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=net.froemling.bombsquad",
    art: { from: "#7c2d12", to: "#fbbf24", icon: "Bomb" },
    systemRequirements: {
      min: "macOS via the Mac App Store, or Android 5.0+. Windows/Linux builds are published on ballistica.net as developer test builds.",
      recommended: "macOS via the Mac App Store, or Android 5.0+. Windows/Linux builds are published on ballistica.net as developer test builds.",
    },
    launcherInstall: {
      enabled: true,
      kind: "external",
      url: "https://ballistica.net",
      note: "Official builds are on the Mac App Store and Google Play. Windows/Linux downloads on ballistica.net are the developer's own test builds — more current but less stable than a store release.",
    },
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "among-us",
    title: "Among Us",
    tagline: "A social deduction game of teamwork and betrayal for 4–15 players, in space.",
    // Steam's SKU is $4.99, which breaks this catalog's genuinely-free premise
    // (see qualityBar.genuinelyFree and the "isAccessibleForFree: true" claim
    // every game emits in JsonLd.tsx). So no steamAppId and no Steam
    // launcherInstall here — only the two channels that are actually free are
    // presented as install routes. Steam gets one honest sentence in the
    // description and nothing more; it is not an edition on this listing.
    description:
      "A social deduction game where most of the crew runs tasks around a spaceship while a hidden handful of impostors try to pick everyone off without getting caught. Discussion and voting between rounds are where the game actually happens — reading people, building alibis, catching someone in a lie. Free on mobile, ad-supported; a paid, ad-free version also exists on Steam and other storefronts for $4.99.",
    developerSlug: "innersloth",
    developerName: "Innersloth",
    genres: ["Social Deduction"],
    tags: ["Social Deduction", "Party", "Space"],
    aliases: [],
    license: "Free to Play (mobile, ad-supported)",
    releaseYear: 2018,
    sizeMB: 1057,
    platforms: ["Android", "iOS"],
    features: ["Multiplayer", "Co-op", "Cross-play", "Controller Support"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://www.innersloth.com/games/among-us/",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.innersloth.spacemafia",
    iosStoreUrl: "https://apps.apple.com/us/app/among-us/id1351168404",
    art: { from: "#7f1d1d", to: "#fbbf24", icon: "Target" },
    coverImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/945360/header.jpg",
    screenshots: ["https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/945360/ss_b7374128e5b786a302a716bca038d604b00ffe46.1920x1080.jpg"],
    systemRequirements: {
      min: "iOS 13.0 or later, or Android 5.0 or later. See app store listing for device-specific requirements.",
      recommended: "iOS 13.0 or later, or Android 5.0 or later. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "data-wing",
    title: "Data Wing",
    tagline: "A fast top-down arcade flyer about drifting a data probe through hostile checkpoints.",
    description:
      "A top-down arcade flyer with drift-heavy handling, sending a small data-recovery drone through increasingly hostile checkpoint courses. Runs are short and restart-friendly, built around shaving time and finding the cleanest line through each stage rather than any story or progression system.",
    developerSlug: "daniel-vogt",
    developerName: "Daniel Vogt",
    genres: ["Racing", "Arcade"],
    tags: ["Arcade", "Fast-Paced", "Drifting"],
    aliases: [],
    license: "Free to Play",
    releaseYear: 2017,
    sizeMB: 108,
    platforms: ["Android", "iOS"],
    features: ["Singleplayer"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://apps.apple.com/us/app/data-wing/id1206723870",
    iosStoreUrl: "https://apps.apple.com/us/app/data-wing/id1206723870",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.DanVogt.DATAWING",
    art: { from: "#0c4a6e", to: "#38bdf8", icon: "Zap" },
    systemRequirements: {
      min: "iOS 8.0 or later, or a comparable Android device. See app store listing for device-specific requirements.",
      recommended: "iOS 8.0 or later, or a comparable Android device. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
  {
    slug: "mekorama",
    title: "Mekorama",
    tagline: "A tiny, relaxing isometric block puzzle about guiding a little robot home.",
    description:
      "A small isometric puzzle game about tilting and rebuilding toy-sized dioramas to walk a little robot to its goal. Levels are short, hand-crafted, and unhurried — closer to a fidget toy than a challenge-driven puzzler — with a level editor for anyone who wants to build and share their own.",
    developerSlug: "fancade",
    developerName: "Fancade AB",
    genres: ["Puzzle"],
    tags: ["Isometric", "Relaxing", "Level Editor"],
    aliases: [],
    license: "Free to Play",
    releaseYear: 2016,
    sizeMB: 12,
    platforms: ["Android", "iOS"],
    features: ["Singleplayer", "Map Editor", "Community Content"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://www.mekorama.com",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.martinmagni.mekorama",
    iosStoreUrl: "https://apps.apple.com/us/app/mekorama/id1079464948",
    art: { from: "#365314", to: "#a3e635", icon: "Blocks" },
    systemRequirements: {
      min: "iOS 11.0 or later, or a comparable Android device. See app store listing for device-specific requirements.",
      recommended: "iOS 11.0 or later, or a comparable Android device. See app store listing for device-specific requirements.",
    },
    launcherInstall: null,
    status: "draft",
    published: false,
    managedBy: "admin",
  },
];

/** No verified mods for this wave. */
const MODS: Record<string, unknown>[] = [];

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("add:games-wave-3 skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const Developer = (await import("../src/lib/models/Developer")).default;

  await dbConnect();

  let created = 0;
  const plan: string[] = [];

  for (const dev of DEVELOPERS) {
    const exists = await Developer.findOne({ slug: dev.slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} developer  ${dev.slug}`);
    if (!exists && apply) {
      await Developer.create(dev);
      created++;
    }
  }

  for (const game of GAMES) {
    const exists = await CatalogGame.findOne({ slug: game.slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} game       ${game.slug} (${game.sizeMB} MB)`);
    if (!exists && apply) {
      await CatalogGame.create(game);
      created++;
    }
  }

  for (const mod of MODS) {
    const slug = String(mod.slug);
    const exists = await CatalogMod.findOne({ slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} mod        ${slug}`);
    if (!exists && apply) {
      await CatalogMod.create(mod);
      created++;
    }
  }

  console.log(apply ? "add:games-wave-3 —" : "add:games-wave-3 — DRY RUN (pass --apply to write):");
  for (const line of plan) console.log(`  ${line}`);

  if (apply) {
    console.log(
      created === 0
        ? "  Nothing to do — everything already exists."
        : `\nCreated ${created} record(s). Games are drafts — publish from the admin once reviewed.`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("add:games-wave-3 failed:", err);

  // The deploy passes --soft-fail so a database blip cannot block a release
  // over a catalog addition. Insert-only, so the next deploy simply retries.
  if (process.argv.includes("--soft-fail")) {
    console.error("add:games-wave-3: continuing anyway (--soft-fail).");
    process.exit(0);
  }
  process.exit(1);
});
