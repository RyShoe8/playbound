/**
 * Phase 2+ editions: Daggerfall Unity remaster, EQ private eras, SWG community.
 * Seed script defaults unpublished seeds to coming_soon + unlisted; set
 * status/visibility on an entry to publish (e.g. Quarm / P99).
 */
import type {
  EditionInstallConfig,
  EditionType,
  EditionStatus,
  EditionVisibility,
  InstallMethod,
  VerificationLevel,
} from "@/lib/editionTypes";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import {
  ARENA_GAMEFILES_FILE,
  ARENA_GAMEFILES_URL,
  OPENTESARENA_EXE_HINT,
  OPENTESARENA_KNOWN_EXE_PATHS,
  TES_ARENA_EXE_HINT,
  TES_ARENA_KNOWN_EXE_PATHS,
} from "@/lib/data/tesArenaAssets";

export type EditionSeed = {
  gameSlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  type?: EditionType;
  status?: EditionStatus;
  visibility?: EditionVisibility;
  sortOrder?: number;
  isDefault?: boolean;
  branding?: {
    logo?: string | null;
    heroImage?: string | null;
    screenshots?: string[];
    videos?: string[];
  };
  links?: {
    website?: string | null;
    discord?: string | null;
    wiki?: string | null;
    github?: string | null;
    forum?: string | null;
  };
  installMethod: InstallMethod;
  installConfig?: EditionInstallConfig;
  requirements?: { min?: string; recommended?: string; notes?: string };
  hardwareRequirements?: HardwareRequirementsBlock | null;
  features?: string[];
  tags?: string[];
  aliases?: string[];
  serverName?: string | null;
  languages?: string[];
  version?: string | null;
  faq?: { q: string; a: string }[];
  verificationLevel?: VerificationLevel;
  verificationNote?: string | null;
};

export const editions: EditionSeed[] = [
  {
    gameSlug: "daggerfall",
    slug: "daggerfall-unity",
    name: "Daggerfall Unity",
    shortDescription: "Open-source Unity remaster of TES II with modern controls and mods.",
    description:
      "Daggerfall Unity rebuilds The Elder Scrolls II: Daggerfall in Unity. You still need original Daggerfall game data (legal GOG/Steam/retail). Huge world, modern UI, and a thriving mod scene via DF Workshop.",
    type: "remaster",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.dfworkshop.net",
      github: "https://github.com/Interkarma/daggerfall-unity",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/launcher-packages/games/daggerfall/1787010604732-Daggerfall-Unity-PlayBound-v1.1.1.zip",
        fileName: "Daggerfall-Unity-PlayBound-v1.1.1.zip",
        versionLabel: "v1.1.1",
        exeHint: "DaggerfallUnity.exe",
        knownExePaths: ["DaggerfallUnity.exe"],
        note: "PlayBound's verified Daggerfall Unity v1.1.1 package, including the free game data.",
      },
    },
    requirements: {
      notes: "Place Arena2 / DAGGER data from a legal Daggerfall install when first launching.",
    },
    features: ["Singleplayer", "Mod Support", "Controller Support"],
    tags: ["Remaster", "Open Source", "RPG"],
    aliases: ["DFU", "DaggerfallUnity"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "daggerfall",
    slug: "classic-dos",
    name: "Classic DOS (1996)",
    shortDescription: "Original 1996 DOS release of The Elder Scrolls II: Daggerfall.",
    description:
      "The unaltered 1996 MS-DOS release of Daggerfall as published by Bethesda Softworks. Play through DOSBox or DOSBox Staging for historical authenticity.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://elderscrolls.bethesda.net/en/daggerfall",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/DFInstall.zip",
        fileName: "DFInstall.zip",
        versionLabel: "1.0 (Bethesda freeware release)",
        exeHint: "FALL.EXE",
        knownExePaths: ["DFCD/DAGGER/FALL.EXE", "DAGGER/FALL.EXE", "FALL.EXE"],
        launchArgs: ["Z.CFG"],
        needsDosBox: true,
        note: "Installs Bethesda's freeware DOS release, configures its full game data, and runs it through PlayBound-managed DOSBox Staging.",
      },
    },
    requirements: {
      notes: "Requires DOSBox or compatible DOS emulator.",
    },
    features: ["Singleplayer"],
    tags: ["Classic", "DOS", "Retro", "RPG"],
    aliases: ["Daggerfall DOS", "Vanilla Daggerfall"],
    verificationLevel: "official",
  },
  {
    gameSlug: "daggerfall",
    slug: "playbound-remastered",
    name: "PlayBound Edition",
    shortDescription:
      "One-click Daggerfall Unity with Bethesda's freeware data. DREAM and Distant Terrain stay on the Mods tab.",
    description:
      "PlayBound Edition is the Daggerfall Unity client we already host — Unity remaster, freeware game data in the zip, DaggerfallUnity.exe ready to run. It is the same verified v1.1.1 package as the Daggerfall Unity edition, listed here as the PlayBound-flavoured install so you do not have to hunt the default remaster.\n\nIt does not pre-apply D.R.E.A.M. or Distant Terrain. Those packs live on Nexus, and Nexus forbids re-hosting them. After this edition installs, open the Mods tab: DREAM is the audiovisual overhaul, Distant Terrain pushes the Iliac Bay horizon. Both need a Nexus login.\n\nThe default Daggerfall Unity edition is unchanged. Classic DOS stays the 1996 freeware path.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 15,
    links: {
      website: "https://www.dfworkshop.net",
      github: "https://github.com/Interkarma/daggerfall-unity",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/launcher-packages/games/daggerfall/1787010604732-Daggerfall-Unity-PlayBound-v1.1.1.zip",
        fileName: "Daggerfall-Unity-PlayBound-v1.1.1.zip",
        versionLabel: "v1.1.1",
        exeHint: "DaggerfallUnity.exe",
        knownExePaths: ["DaggerfallUnity.exe"],
        note: "Same PlayBound Daggerfall Unity v1.1.1 zip as the default remaster, including freeware data. DREAM and Distant Terrain are separate Nexus mods.",
      },
    },
    requirements: {
      notes:
        "One-click DFU plus freeware data. Install DREAM (Nexus mod 5) and Distant Terrain (Nexus mod 128) from the Mods tab — PlayBound cannot re-host those files.",
    },
    features: ["Singleplayer", "Mod Support", "Controller Support", "Freeware Data"],
    tags: ["Remaster", "Open Source", "RPG", "PlayBound"],
    aliases: ["PlayBound Daggerfall", "DFU PlayBound Edition", "Daggerfall Remastered"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Is DREAM included?",
        a: "No. Nexus forbids uploading DREAM to other sites. Install this edition, then grab DREAM from the Mods tab (Nexus login).",
      },
      {
        q: "How is this different from Daggerfall Unity?",
        a: "Same zip and same exe. This row is the PlayBound-labelled install path; the default Daggerfall Unity edition is unchanged.",
      },
    ],
  },
  {
    gameSlug: "morrowind",
    slug: "openmw",
    name: "OpenMW (Modern Remaster)",
    shortDescription:
      "Modern 64-bit open-source engine recreation of Morrowind with widescreen, controller support, and uncapped performance.",
    description:
      "OpenMW is a free, modern 64-bit open-source engine reimplementation of The Elder Scrolls III: Morrowind. Built from scratch in C++ using OpenSceneGraph, OpenMW provides native widescreen rendering, modern physics, extended draw distance, full gamepad support, native macOS/Linux/Steam Deck compatibility, and an advanced Lua scripting engine without original engine memory crashes.\n\nRequires original Morrowind Game of the Year data files (Morrowind.esm, Tribunal, Bloodmoon).",
    type: "remaster",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://openmw.org",
      github: "https://github.com/OpenMW/openmw",
      discord: "https://discord.gg/openmw",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-release",
        repo: "OpenMW/openmw",
        assetPattern: "openmw-.*-win64\\.zip$",
        exeHint: "openmw.exe",
        knownExePaths: ["openmw.exe", "openmw-launcher.exe"],
        note: "Standalone OpenMW 64-bit engine package. Point to your legal Morrowind GOTY data folder.",
      },
    },
    requirements: {
      notes: "Requires legal Morrowind Game of the Year game files (GOG / Steam / CD).",
    },
    features: ["Singleplayer", "Mod Support", "Controller Support", "High Framerate", "Widescreen Support", "Steam Deck Verified"],
    tags: ["Remaster", "Open Source", "RPG", "OpenMW", "Bethesda"],
    aliases: ["OpenMW", "Morrowind OpenMW", "Morrowind Remastered"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "morrowind",
    slug: "tes3mp",
    name: "TES3MP (Morrowind Multiplayer)",
    shortDescription:
      "Full multiplayer co-op and persistent server synchronization for Morrowind built on OpenMW.",
    description:
      "TES3MP brings true multiplayer to The Elder Scrolls III: Morrowind. Built on top of the open-source OpenMW engine, TES3MP synchronizes player movement, combat, NPC dialogue, quest progression, spells, world containers, and faction standing across dedicated servers.\n\nHost a private co-op party with friends or join public persistent RPG servers featuring custom Lua gameplay scripts, housing, PvP arenas, and faction wars.",
    type: "community",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://tes3mp.com",
      github: "https://github.com/TES3MP/TES3MP",
      discord: "https://discord.gg/tes3mp",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-release",
        repo: "TES3MP/TES3MP",
        assetPattern: "tes3mp-.*-windows.*\\.zip$",
        exeHint: "tes3mp.exe",
        knownExePaths: ["tes3mp.exe", "tes3mp-browser.exe"],
        launchArgs: ["--connect={host}:{port}"],
        note: "TES3MP multiplayer client. Connect to public PlayBound servers or host a party.",
      },
    },
    requirements: {
      notes: "Requires legal Morrowind Game of the Year game files.",
    },
    features: ["Multiplayer", "Dedicated Servers", "Co-op", "PvP", "Mod Support", "Controller Support", "Lua Scripting"],
    tags: ["Multiplayer", "Co-op", "OpenMW", "TES3MP", "RPG", "Dedicated Servers"],
    aliases: ["TES3MP", "Morrowind Multiplayer", "Morrowind Co-op"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "morrowind",
    slug: "classic-goty",
    name: "Classic GOTY (Original Engine)",
    shortDescription:
      "Original 2002 Bethesda Gamebryo executable for Morrowind Code Patch (MCP) and MGE XE purists.",
    description:
      "The original 2002 32-bit Morrowind executable as published by Bethesda. Recommended for players who want to use original DirectX 8/9 code hooks like Morrowind Code Patch (MCP), Morrowind Script Extender (MWSE), and MGE XE graphics enhancer.",
    type: "official",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://elderscrolls.bethesda.net/en/morrowind",
    },
    installMethod: "external",
    requirements: {
      notes: "Installed directly via GOG / Steam or retail installer.",
    },
    features: ["Singleplayer", "Classic Engine", "MWSE Support"],
    tags: ["Classic", "Vanilla", "RPG", "Bethesda"],
    aliases: ["Vanilla Morrowind", "Morrowind GOTY Classic"],
    verificationLevel: "official",
  },
  {
    gameSlug: "asherons-call",
    slug: "coldeve",
    name: "Coldeve (Default PvE)",
    shortDescription: "End-of-Retail ACEmulator PvE server with active community and 3-account limit.",
    description:
      "Coldeve is the largest and most populated community server powered by ACEmulator. Features complete End-of-Retail content, quest dungeons, live world events, and a balanced 3-account simultaneous connection policy.",
    type: "community",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://coldeve.ac/",
      discord: "https://discord.gg/acemulator",
      github: "https://github.com/ACEmulator/ACE",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://github.com/torreyd/ThwargLauncher/releases/download/v3.4.1.0/ThwargLauncherInstaller.exe",
        fileName: "ThwargLauncherInstaller.exe",
        versionLabel: "v3.4.1",
        exeHint: "thwarg|acclient",
        knownExePaths: [
          "%LOCALAPPDATA%\\Programs\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%LOCALAPPDATA%\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Turbine\\Asheron's Call\\acclient.exe",
          "%PROGRAMFILES%\\Turbine\\Asheron's Call\\acclient.exe",
          "%LOCALAPPDATA%\\Turbine\\Asheron's Call\\acclient.exe",
          "ThwargLauncher.exe",
          "acclient.exe",
        ],
        note: "Installs complete Asheron's Call client and ThwargLauncher configured for Coldeve.",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Mod Support", "Open World"],
    tags: ["ACE", "PvE", "End of Retail", "Community"],
    aliases: ["Coldeve AC", "Coldeve Server"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "asherons-call",
    slug: "levistras",
    name: "Levistras (No-Bot Manual Play)",
    shortDescription: "Strictly manual play PvE server with zero tolerance for automated macros.",
    description:
      "Levistras is dedicated to players who want pure, nostalgic Asheron's Call gameplay without automated macroing or unattended botting. All characters must be actively played by hand.",
    type: "community",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://levistras.ac/",
      discord: "https://discord.gg/acemulator",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://github.com/torreyd/ThwargLauncher/releases/download/v3.4.1.0/ThwargLauncherInstaller.exe",
        fileName: "ThwargLauncherInstaller.exe",
        versionLabel: "v3.4.1",
        exeHint: "thwarg|acclient",
        knownExePaths: [
          "%LOCALAPPDATA%\\Programs\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%LOCALAPPDATA%\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Turbine\\Asheron's Call\\acclient.exe",
          "%PROGRAMFILES%\\Turbine\\Asheron's Call\\acclient.exe",
          "%LOCALAPPDATA%\\Turbine\\Asheron's Call\\acclient.exe",
          "ThwargLauncher.exe",
          "acclient.exe",
        ],
        note: "Configured for Levistras manual-play server.",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Open World", "Roleplay"],
    tags: ["Manual Play", "No Bots", "PvE", "Nostalgia"],
    aliases: ["Levistras AC"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "asherons-call",
    slug: "seedsow",
    name: "Seedsow (Classic 1999-2005 Era)",
    shortDescription: "Pre-Throne of Destiny classic mechanics and original Dereth geography.",
    description:
      "Recreates the beloved classic era of Asheron's Call before the Throne of Destiny expansion. Features original skill point costs, classic spell formulas, and vintage weapon balance.",
    type: "community",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://seedsow.ca/",
      discord: "https://discord.gg/acemulator",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://github.com/torreyd/ThwargLauncher/releases/download/v3.4.1.0/ThwargLauncherInstaller.exe",
        fileName: "ThwargLauncherInstaller.exe",
        versionLabel: "v3.4.1",
        exeHint: "thwarg|acclient",
        knownExePaths: [
          "%LOCALAPPDATA%\\Programs\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%LOCALAPPDATA%\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Turbine\\Asheron's Call\\acclient.exe",
          "%PROGRAMFILES%\\Turbine\\Asheron's Call\\acclient.exe",
          "%LOCALAPPDATA%\\Turbine\\Asheron's Call\\acclient.exe",
          "ThwargLauncher.exe",
          "acclient.exe",
        ],
        note: "Configured for Seedsow classic era server.",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Open World"],
    tags: ["Classic", "Pre-ToD", "Vintage", "Retro"],
    aliases: ["Seedsow AC", "Classic AC"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "asherons-call",
    slug: "dekarutide",
    name: "Dekarutide (Hardcore ARPG)",
    shortDescription: "Custom total overhaul with randomized loot rolls, action combat, and seasonal leagues.",
    description:
      "A complete reimagining of Asheron's Call as an Action-RPG. Features Diablo-style randomized item prefixes/suffixes, custom dungeon maps, and seasonal ladder resets.",
    type: "community",
    isDefault: false,
    sortOrder: 40,
    links: {
      website: "https://dekarutide.com/",
      discord: "https://discord.gg/acemulator",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://github.com/torreyd/ThwargLauncher/releases/download/v3.4.1.0/ThwargLauncherInstaller.exe",
        fileName: "ThwargLauncherInstaller.exe",
        versionLabel: "v3.4.1",
        exeHint: "thwarg|acclient",
        knownExePaths: [
          "%LOCALAPPDATA%\\Programs\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
          "%LOCALAPPDATA%\\ThwargLauncher\\ThwargLauncher.exe",
          "%PROGRAMFILES(X86)%\\Turbine\\Asheron's Call\\acclient.exe",
          "%PROGRAMFILES%\\Turbine\\Asheron's Call\\acclient.exe",
          "%LOCALAPPDATA%\\Turbine\\Asheron's Call\\acclient.exe",
          "ThwargLauncher.exe",
          "acclient.exe",
        ],
        note: "Configured for Dekarutide hardcore ARPG server.",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Mod Support", "Open World"],
    tags: ["Hardcore", "ARPG", "Custom", "Random Loot"],
    aliases: ["Dekarutide AC"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "openlara",
    slug: "web-wasm",
    name: "WebAssembly Browser Edition (Default)",
    shortDescription: "Play classic Tomb Raider instantly in your browser with WebAssembly & WebGL.",
    description:
      "The instant WebAssembly release of OpenLara. Runs directly in any modern web browser at 60 FPS with full audio, dynamic water shaders, and shareware level data.",
    type: "community",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://xproger.info/projects/OpenLara/",
      github: "https://github.com/XProger/OpenLara",
    },
    installMethod: "browser",
    installConfig: {
      browser: {
        playUrl: "https://xproger.info/projects/OpenLara/",
      },
    },
    features: ["Singleplayer", "Controller Support", "Open Source", "Cross-Platform"],
    tags: ["WebAssembly", "WebGL", "Browser", "Instant Play"],
    aliases: ["OpenLara Web", "Browser Tomb Raider"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "openlara",
    slug: "desktop-native",
    name: "Desktop Native (OpenGL / VR / Split-Screen)",
    shortDescription: "Native desktop client with 4K widescreen, VR support, and split-screen co-op.",
    description:
      "High-performance native desktop executable with OpenXR virtual reality headset support, uncapped framerates, 4K texture support, and local 2-player split-screen.",
    type: "community",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://xproger.info/projects/OpenLara/",
      github: "https://github.com/XProger/OpenLara",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "XProger/OpenLara",
        assetPattern: ".*\\.zip$",
        exeHint: "OpenLara.exe",
        note: "Installs native desktop OpenLara.",
      },
    },
    features: ["Singleplayer", "Controller Support", "Open Source", "Local Co-Op", "Mod Support"],
    tags: ["Native", "64-Bit", "VR", "Split-Screen"],
    aliases: ["OpenLara Desktop", "OpenLara PC"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "counter-strike-2",
    slug: "official",
    name: "Counter-Strike 2 (Default)",
    shortDescription: "Official Steam release powered by Source 2 with sub-tick architecture.",
    description:
      "Valve's primary tactical 5v5 competitive release. Features responsive volumetric smokes, Premier MMR matchmaking, and full Steam Workshop community support.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.counter-strike.net",
      discord: "https://discord.gg/counterstrike",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "730",
      },
    },
    features: ["Multiplayer", "Competitive", "Workshop", "Mod Support", "Dedicated Servers"],
    tags: ["FPS", "Tactical", "Esports", "Source 2"],
    aliases: ["CS2 Official", "Counter-Strike 2 Steam"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "counter-strike-2",
    slug: "csgo-legacy",
    name: "CS:GO Legacy Archive (Frozen 1.38.8.7)",
    shortDescription: "The frozen final 2023 build of CS:GO for custom community servers and demos.",
    description:
      "Accessible via Steam beta properties. Preserves the classic Global Offensive branch for viewing older replay demos and playing on legacy community servers.",
    type: "community",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.counter-strike.net",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "730",
      },
    },
    features: ["Multiplayer", "Legacy Server Support", "Demo Viewer"],
    tags: ["Legacy", "Archive", "Global Offensive"],
    aliases: ["CS:GO Legacy", "CSGO 2023"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "valorant",
    slug: "official",
    name: "Riot Client Edition (Default)",
    shortDescription: "Official standalone PC client direct from Riot Games.",
    description:
      "The primary PC client for VALORANT featuring direct Riot Vanguard anti-cheat updates, instant patch downloads, and access to all official ranked and casual queues.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://playvalorant.com",
      discord: "https://discord.gg/valorant",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://playvalorant.com",
        fileName: "Install-VALORANT.exe",
        sizeMB: 65,
      },
    },
    features: ["Multiplayer", "Competitive", "Hero Roster", "128-Tick Servers"],
    tags: ["FPS", "Hero Shooter", "Tactical", "Esports"],
    aliases: ["Valorant Riot", "Valorant PC"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "valorant",
    slug: "epic",
    name: "Epic Games Edition",
    shortDescription: "Play VALORANT through the Epic Games launcher.",
    description:
      "Integrates VALORANT with your Epic Games account library, friend lists, and cross-game notifications while running the official Riot client backend.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://playvalorant.com",
    },
    installMethod: "epic",
    installConfig: {
      epic: {
        productSlug: "valorant",
        launchUrl: "com.epicgames.launcher://apps/Valorant?action=launch&silent=true",
      },
    },
    features: ["Multiplayer", "Epic Games Integration"],
    tags: ["Epic Games", "Launcher", "Free"],
    aliases: ["Valorant Epic"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "war-thunder",
    slug: "official",
    name: "Steam Edition (Default)",
    shortDescription: "Official Steam release with automatic updates and SteamVR support.",
    description:
      "The official Steam client for War Thunder. Supports seamless Steam Wallet purchases, full Steam Deck integration, and native SteamVR cockpit head tracking.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://warthunder.com",
      discord: "https://discord.gg/warthunder",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "236390",
      },
    },
    features: ["Multiplayer", "Cross-Platform", "VR Support", "Controller Support"],
    tags: ["Vehicles", "Simulation", "Steam", "VR"],
    aliases: ["War Thunder Steam"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "war-thunder",
    slug: "gaijin-client",
    name: "Gaijin Direct Launcher Edition",
    shortDescription: "Standalone PC launcher with Ultra HQ 4K texture packages.",
    description:
      "Direct standalone launcher managed by Gaijin Entertainment. Offers modular downloads including Ultra HQ vehicle texture packs and direct WT Live integration.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://warthunder.com",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://warthunder.com",
        fileName: "wt_launcher.exe",
        sizeMB: 35,
      },
    },
    features: ["Multiplayer", "Ultra HQ Textures", "WT Live Support"],
    tags: ["Gaijin", "Standalone", "4K"],
    aliases: ["War Thunder Gaijin"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "wolfenstein-enemy-territory",
    slug: "et-legacy",
    name: "ET: Legacy (Default)",
    shortDescription: "Modern 64-bit open-source engine with modern OpenGL, widescreen, and server downloader.",
    description:
      "ET: Legacy is the recommended, fully open-source modern engine for Wolfenstein: Enemy Territory. Compatible with all original 2.60b mods and maps, with native 64-bit performance, raw mouse input, and modern audio rendering.",
    type: "community",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.etlegacy.com/",
      github: "https://github.com/etlegacy/etlegacy",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        // Official ET: Legacy 2.84.0 Windows archive. x86 is deliberately
        // chosen here because it remains compatible with classic 32-bit mods
        // and servers, while x64 only works with 64-bit mods.
        kind: "direct-zip",
        url: "https://www.etlegacy.com/download/file/734",
        fileName: "etlegacy-v2.85.0-x86.zip",
        checksumMd5: "c03038ed28ff3a05e6aec0c5eeb45be1",
        exeHint: "etl",
        knownExePaths: ["etl.exe", "ETL.exe"],
        unwrapSingleRoot: true,
        overlayUrl:
          "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher-packages/games/wolfenstein-enemy-territory/ET-260b-Base-Data.zip",
        overlayFileName: "ET-260b-Base-Data.zip",
        overlayDest: "etmain",
        note: "Installs ET: Legacy plus official free Enemy Territory etmain data (2.60b).",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Mod Support", "Open Source", "Controller Support"],
    tags: ["Engine", "64-Bit", "Remaster", "Open Source"],
    aliases: ["ETL", "ET Legacy"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "wolfenstein-enemy-territory",
    slug: "steam",
    name: "Steam Official",
    shortDescription: "Official id Software / Bethesda release on Steam.",
    description:
      "The official release of Wolfenstein: Enemy Territory on Steam by id Software and Bethesda Softworks. Free to play.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://store.steampowered.com/app/1873030/Wolfenstein_Enemy_Territory/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1873030",
      },
    },
    features: ["Multiplayer", "Dedicated Servers", "Mod Support"],
    tags: ["Official", "Steam"],
    aliases: ["Steam ET"],
    verificationLevel: "official",
  },
  {
    gameSlug: "everquest",
    slug: "official",
    name: "EverQuest Live",
    shortDescription: "Official free-to-play EverQuest from Daybreak / Darkpaw.",
    description:
      "EverQuest Live is the official Daybreak progression client — free to download and play with optional All Access. PlayBound opens the official LaunchPad installer; you finish patching and log in with a Daybreak account.\n\nLive world activity shown on PlayBound uses Daybreak Census load bands (low/medium/high) mapped to conservative estimates — Daybreak does not publish exact concurrent counts for EQ1.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.everquest.com",
      forum: "https://forums.everquest.com/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://launch.daybreakgames.com/installer/EQ_setup.exe",
        fileName: "EQ_setup.exe",
        versionLabel: "daybreak-launchpad",
        exeHint: "LaunchPad",
        knownExePaths: [
          "C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest\\LaunchPad.exe",
          "C:\\Program Files (x86)\\Sony\\EverQuest\\LaunchPad.exe",
          "C:\\Program Files\\Daybreak Game Company\\Installed Games\\EverQuest\\LaunchPad.exe",
        ],
        note:
          "Opens the official Daybreak EQ_setup.exe LaunchPad. Playing Now for Live worlds is estimated from Daybreak load bands (low≈15, medium≈60, high≈150).",
        steps: [
          {
            platform: "all",
            text: "Create a free Daybreak Games account at https://www.daybreakgames.com/ (or during LaunchPad signup). Confirm your email before trying to log in.",
          },
          {
            platform: "windows",
            text: "Click Install with PlayBound. The desktop app downloads EQ_setup.exe and opens the official Daybreak LaunchPad installer.",
          },
          {
            platform: "windows",
            text: "Finish the LaunchPad wizard, let it download/patch EverQuest Live, then sign in with your Daybreak account.",
          },
          {
            platform: "all",
            text: "On the server select screen pick any Live world. EverQuest is free-to-play; All Access removes more F2P limits if you want them later.",
          },
        ],
      },
    },
    requirements: {
      notes:
        "Requires a Daybreak account. LaunchPad installs/patches the official client — PlayBound does not redistribute EverQuest game data.",
      min: "Windows 10 64-bit · Dual-core CPU · 4 GB RAM · DX11 GPU · ~20 GB free",
      recommended: "Windows 10/11 · Quad-core · 8 GB RAM · Dedicated DX11 GPU · SSD",
    },
    hardwareRequirements: {
      min: {
        ramMB: 4096,
        apis: [
          "dx11",
        ],
        storageMB: 20480,
        cpuText: "Dual-core CPU",
        gpuText: "DX11 GPU",
        cpuTier: "low",
        gpuTier: "entry",
        notes: "Windows 10 64-bit",
      },
      recommended: {
        ramMB: 8192,
        apis: [
          "dx11",
        ],
        cpuText: "Quad-core",
        gpuText: "Dedicated DX11 GPU",
        cpuTier: "mid",
        gpuTier: "entry",
        notes: "Windows 10/11 · SSD",
      },
      provenance: {
        source: "unverified",
        enteredBy: "free-text-parser",
      },
    },
    serverName: "EverQuest Live",
    features: ["Multiplayer", "PvE", "Free to Play", "Singleplayer"],
    tags: ["Official", "MMORPG", "F2P", "EQ"],
    aliases: ["EQ Live", "EverQuest Official", "Daybreak EQ"],
    faq: [
      {
        q: "Is EverQuest Live free?",
        a: "Yes. Create a Daybreak account and play Free-to-Play. An optional All Access subscription unlocks additional benefits and higher F2P limits.",
      },
      {
        q: "How do Live player counts work on PlayBound?",
        a: "Daybreak’s public Census API reports load bands (low / medium / high) per world, not exact concurrency. PlayBound maps those conservatively to ~15 / ~60 / ~150 players so Official can contribute to Playing Now without inventing precise counts. Each world row also shows the raw band as “Load: …”.",
      },
      {
        q: "Where does the installer come from?",
        a: "PlayBound downloads EQ_setup.exe from Daybreak’s LaunchPad CDN (launch.daybreakgames.com). We do not host EverQuest client files.",
      },
    ],
    verificationLevel: "community_verified",
    verificationNote: "Official Daybreak LaunchPad download; population uses Census load-band estimates.",
  },
  {
    gameSlug: "everquest",
    slug: "project-quarm",
    name: "Project Quarm",
    shortDescription:
      "Community EverQuest era with curated progression. Requires your own EverQuest client.",
    description:
      "Project Quarm is a community EverQuest server that uses the TAKP classic client and login system.\n\nYou provide your own legal EverQuest client — PlayBound does not distribute it. You will also need a TAKP forum and game account and the latest Quarm patch from their Discord before you can log in.\n\nQuarm is a third-party community project and is not affiliated with Daybreak. Always get patches and rules from official Quarm channels.",
    type: "community",
    status: "active",
    visibility: "public",
    sortOrder: 20,
    links: {
      website: "https://www.projectquarm.com/",
      discord: "https://discord.gg/projectquarm",
      wiki: "https://wiki.projectquarm.com/",
      forum: "https://www.takproject.net/forums/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        /*
         * BROKEN UPSTREAM — sahaquiel.us stopped resolving entirely (no DNS,
         * not a 404), and it was a community mirror rather than an official
         * source, so there is nothing to retarget it to. projectquarm.com and
         * takproject.net are both still up and remain the real distribution
         * route, which is what the steps below already walk players through.
         *
         * Kept as "external" rather than deleted: the edition's setup guide is
         * genuinely useful and the server is alive, so PlayBound hands off to
         * the project instead of pretending it can install the client. Restore
         * a direct recipe only against a URL that upstream actually publishes.
         */
        kind: "external",
        url: "https://www.projectquarm.com/",
        exeHint: "eqgame",
        // Deliberately no postInstallDiscord: installing should not throw the
        // player into a chat app. The patch step is covered by `steps` below
        // and the Discord link is on the edition page.
        postInstallEqw: true,
        note:
          "Installing here only sets up the base client. You still need a TAKP game account and the latest Quarm Discord patch before login will work.",
        steps: [
          {
            platform: "all",
            text: "Create ONE forum account on the Al`Kabor Project forums (Quarm uses TAKP accounts): https://www.takproject.net/forums/ — pick a careful username; forum accounts cannot be renamed later.",
          },
          {
            platform: "all",
            text: "While logged into the forums, open Game Accounts → Create Login Server Account (https://www.takproject.net/forums/tools.php?tool=account). Use this game account username/password at the client login screen — not your forum password alone.",
          },
          {
            platform: "all",
            text: "Join Project Quarm Discord (https://discord.gg/projectquarm) and open #server-files. You will need the latest Quarm patch zip after the base client is installed.",
          },
          {
            platform: "windows",
            text: "Click Install with PlayBound. The launcher downloads TAKP/Quarm v2.2, extracts it under PlayBound Games/everquest/project-quarm, and fetches the latest public eqw.dll.",
          },
          {
            platform: "windows",
            text: "When Discord and the install folder open, download the newest Patch-… zip from #server-files and extract it into that same folder (overwrite when prompted). Do not skip this — an unpatched client cannot stay connected to Quarm.",
          },
          {
            platform: "windows",
            text: "Click Play in PlayBound (or run eqgame.exe). Finish first-run graphics settings, then log in with your TAKP game account and choose Project Quarm.",
          },
        ],
      },
    },
    requirements: {
      notes:
        "Requires a TAKP forum account + linked game (login server) account. Create only one forum account. Quarm patches come from Discord #server-files — not from PlayBound.",
      min: "Windows 10 · Dual-core CPU · 4 GB RAM · DirectX 9/11 GPU · ~4 GB free for client",
      recommended: "Windows 10/11 · Quad-core · 8 GB RAM · Dedicated GPU · SSD",
    },
    hardwareRequirements: {
      min: {
        ramMB: 4096,
        apis: [
          "dx9",
        ],
        storageMB: 4096,
        cpuText: "Dual-core CPU",
        gpuText: "DirectX 9/11 GPU",
        cpuTier: "low",
        gpuTier: "entry",
        notes: "Windows 10 · for client",
      },
      recommended: {
        ramMB: 8192,
        cpuText: "Quad-core",
        gpuText: "Dedicated GPU",
        cpuTier: "mid",
        gpuTier: "entry",
        notes: "Windows 10/11 · SSD",
      },
      provenance: {
        source: "unverified",
        enteredBy: "free-text-parser",
      },
    },
    serverName: "Project Quarm",
    features: ["Multiplayer", "PvE", "Singleplayer"],
    tags: ["Private Server", "Classic", "EQ"],
    aliases: ["Quarm"],
    faq: [
      {
        q: "Why do I need a TAKP forum account for Quarm?",
        a: "Project Quarm uses the Al`Kabor Project (TAKP) account and login systems. Your game login is created under Game Accounts on the TAKP forums after you register a forum account.",
      },
      {
        q: "Can I create more than one forum account?",
        a: "No. Create only one TAKP forum account. You may create multiple game accounts under that single forum account (up to the TAKP limits). Extra forum accounts can be deleted and lock you out of linked game accounts.",
      },
      {
        q: "I get error 1001 / cannot log in — what did I miss?",
        a: "You likely only made a forum account. Open Game Accounts on the TAKP forums and create a Login Server Account, then use that game username/password in eqgame.exe.",
      },
      {
        q: "Is installing in PlayBound enough to play Quarm?",
        a: "No. After the base client installs you must extract the latest patch from Quarm Discord #server-files into the install folder, then log in with your TAKP game account.",
      },
      {
        q: "Where do Quarm player counts on PlayBound come from?",
        a: "Live Playing Now for Quarm uses the concurrent player count shown on the public EQEmulator server list for “Project Quarm” (not TAKP zone population). Numbers refresh periodically and can lag a few minutes.",
      },
    ],
    verificationLevel: "community_verified",
    verificationNote:
      "Auto-installs the public TAKP v2.2 zip; Quarm patches and accounts remain on Quarm/TAKP official channels.",
  },
  {
    gameSlug: "everquest",
    slug: "project-99",
    name: "Project 1999",
    shortDescription:
      "Classic EverQuest recreation circa late 1990s / early Velious. Requires your own Titanium client.",
    description:
      "Project 1999 recreates classic EverQuest eras on community servers. PlayBound cannot ship Titanium — you provide a legal EverQuest Titanium install, then PlayBound copies it, overlays the public P99Files zip, and launches with patchme.\n\nYou also need a Project 1999 forum account and a login-server account before the client will authenticate. P99 is not affiliated with Daybreak.",
    type: "community",
    status: "active",
    visibility: "public",
    sortOrder: 30,
    links: {
      website: "https://www.project1999.com/",
      wiki: "https://wiki.project1999.com/",
      forum: "https://www.project1999.com/forums/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "locate-then-zip",
        requiresBaseDir: true,
        overlayUrl: "https://www.project1999.com/files/P99FilesV61.zip",
        overlayFileName: "P99FilesV61.zip",
        versionLabel: "p99files-v61",
        exeHint: "eqgame",
        connectArgs: ["patchme"],
        note:
          "PlayBound never ships Titanium. Installing here copies your legal Titanium folder and merges P99Files, then Play launches with patchme.",
        steps: [
          {
            platform: "all",
            text: "Own a legal EverQuest Titanium client (discs/ISO/existing install). Install Titanium somewhere clean if needed, and do not Daybreak-live-patch that folder before using it with P99.",
          },
          {
            platform: "all",
            text: "Register on the Project 1999 forums (https://www.project1999.com/forums/), confirm your email, then create a login-server (game) account. That game username/password is what you type in the client.",
          },
          {
            platform: "windows",
            text: "Click Install with PlayBound and select the folder that contains your Titanium eqgame.exe. PlayBound copies that tree into Games/everquest/project-99 (your original folder is left untouched).",
          },
          {
            platform: "windows",
            text: "PlayBound downloads and merges the public P99Files zip into the copy. Wait until status says install complete.",
          },
          {
            platform: "windows",
            text: "Click Play. PlayBound runs eqgame.exe with the patchme argument (required). Log in with your P99 login-server account and pick a Project 1999 server (for example Green).",
          },
        ],
      },
    },
    requirements: {
      notes:
        "Requires (1) a legal Titanium client folder with eqgame.exe and (2) a Project 1999 forum account plus linked login-server account. PlayBound does not redistribute Titanium.",
      min: "Windows 10 · Dual-core CPU · 4 GB RAM · DirectX 9 GPU · Titanium install + ~6 GB free",
      recommended: "Windows 10/11 · Quad-core · 8 GB RAM · Dedicated GPU · SSD",
    },
    hardwareRequirements: {
      min: {
        ramMB: 4096,
        apis: [
          "dx9",
        ],
        storageMB: 6144,
        cpuText: "Dual-core CPU",
        gpuText: "DirectX 9 GPU",
        cpuTier: "low",
        gpuTier: "entry",
        notes: "Windows 10 · Titanium install +",
      },
      recommended: {
        ramMB: 8192,
        cpuText: "Quad-core",
        gpuText: "Dedicated GPU",
        cpuTier: "mid",
        gpuTier: "entry",
        notes: "Windows 10/11 · SSD",
      },
      provenance: {
        source: "unverified",
        enteredBy: "free-text-parser",
      },
    },
    serverName: "Project 1999",
    features: ["Multiplayer", "PvE", "PvP", "Singleplayer"],
    tags: ["Private Server", "Classic", "EQ"],
    aliases: ["P99", "Project1999"],
    faq: [
      {
        q: "Do I need a Project 1999 forum account?",
        a: "Yes. Register on the Project 1999 forums, confirm your email, then create a login-server account. Use the login-server account credentials in the game client — not Live Daybreak credentials.",
      },
      {
        q: "Where do I get Titanium?",
        a: "From a legal EverQuest Titanium copy you already own (discs/ISO/prior install). PlayBound will not download or host Titanium; the installer only asks you to locate your existing folder.",
      },
      {
        q: "Why does PlayBound launch with patchme?",
        a: "Titanium must be started with the patchme argument for P99. PlayBound stores that automatically so Play runs eqgame.exe patchme for you.",
      },
      {
        q: "Will installing P99 change my original Titanium folder?",
        a: "No. PlayBound copies Titanium into Games/everquest/project-99 and merges P99Files there. Your source Titanium install stays as you left it.",
      },
      {
        q: "Where do Project 1999 player counts on PlayBound come from?",
        a: "Playing Now for P99 sums the concurrent counts for Project 1999 Green, Blue, and Red from the public EQEmulator server list. Each realm also appears as its own row in the EverQuest server browser.",
      },
    ],
    verificationLevel: "community_verified",
    verificationNote: "Locate-Titanium + public P99Files overlay; Titanium itself is never redistributed.",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "swgemu-finalizer",
    name: "SWGEmu: Finalizer (Pre-CU Classic)",
    shortDescription: "The definitive 2003–2004 Pre-Combat Upgrade classic 14.1 experience.",
    description:
      "SWGEmu Finalizer faithfully recreates the original 2003 Star Wars Galaxies 14.1 experience: 32 skill-based professions, deep non-combat crafting economies, player-founded planetary cities, and classic bounty hunting.",
    type: "community",
    sortOrder: 10,
    isDefault: true,
    links: {
      website: "https://www.swgemu.com/",
      discord: "https://discord.gg/swgemu",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "locate-then-zip",
        requiresBaseDir: true,
        url: "https://www.swgemu.com",
        note: "Requires original SWG 14.1 game data files, then updates with SWGEmu Launchpad.",
      },
    },
    serverName: "Finalizer",
    features: ["Multiplayer", "MMORPG", "Pre-CU 14.1", "Player Cities", "32 Professions"],
    tags: ["Pre-CU", "Classic", "Sandbox", "SWGEmu"],
    aliases: ["SWGEmu", "Finalizer", "SWG Classic"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "legends",
    name: "SWG Legends (NGE + Jump to Lightspeed)",
    shortDescription: "Post-NGE era with full space dogfights, Bespin, and high-level Heroics.",
    description:
      "SWG Legends continues the New Game Experience era featuring complete space combat in Jump to Lightspeed, player-piloted gunships, custom Bespin and Mandalore content, and endgame Heroic instances.",
    type: "community",
    sortOrder: 20,
    isDefault: false,
    links: {
      website: "https://www.swglegends.com/",
      discord: "https://discord.gg/swglegends",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swglegends.com/",
        instructions: "Download the SWG Legends Launcher from swglegends.com and point it to your SWG directory.",
      },
    },
    serverName: "Legends",
    features: ["Multiplayer", "NGE", "Jump to Lightspeed", "Space Combat", "Heroic Instances"],
    tags: ["NGE", "Space", "Legends", "Bespin"],
    aliases: ["Legends", "SWG Legends NGE"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "restoration",
    name: "SWG Restoration 3 (Combat Upgrade Hybrid)",
    shortDescription: "Custom hybrid ruleset blending Combat Upgrade and active space warfare.",
    description:
      "SWG Restoration 3 combines the depth of classic Pre-CU profession crafting with enhanced Combat Upgrade (CU) combat balance, active ground-to-space faction warfare, and modern client visual upgrades.",
    type: "community",
    sortOrder: 30,
    isDefault: false,
    links: {
      website: "https://swgrestoration.com/",
      discord: "https://discord.gg/swgrestoration",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://swgrestoration.com/",
        instructions: "Download the Restoration 3 launcher from swgrestoration.com.",
      },
    },
    serverName: "Restoration",
    features: ["Multiplayer", "Combat Upgrade", "Custom Progression", "Space Combat"],
    tags: ["CU", "Restoration", "Hybrid"],
    aliases: ["Restoration", "SWG Restoration 3"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "infinity",
    name: "SWG Infinity (Enhanced Pre-CU)",
    shortDescription: "Enhanced Pre-CU galaxy with custom quality-of-life systems.",
    description:
      "SWG Infinity offers a Pre-CU 14.1 foundation enhanced with unique custom planetary events, quality-of-life buff terminals, expanded vehicle selections, and active PvP battlefields.",
    type: "community",
    sortOrder: 40,
    isDefault: false,
    links: {
      website: "https://www.swginfinity.com/",
      discord: "https://discord.gg/swginfinity",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swginfinity.com/",
        instructions: "Download the Infinity launcher from swginfinity.com.",
      },
    },
    serverName: "Infinity",
    features: ["Multiplayer", "Pre-CU QoL", "PvP Battlefields", "Custom Content"],
    tags: ["SWGemu", "Infinity", "Pre-CU"],
    aliases: ["Infinity", "SWG Infinity"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "gamebuddies-io",
    slug: "browser",
    name: "Web Browser Edition (Default)",
    shortDescription: "Zero-install party games played directly in any modern browser.",
    description:
      "Instant multiplayer party games running in HTML5. Supports private rooms, custom room codes, mobile touch drawing, and cross-device play without client downloads.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://gamebuddies.io",
    },
    installMethod: "browser",
    installConfig: {
      browser: {
        playUrl: "https://gamebuddies.io",
      },
    },
    features: ["Multiplayer", "Cross-Platform", "Family Friendly", "Instant Play", "Mobile Compatible"],
    tags: ["Browser", "Party", "Casual", "Trivia"],
    aliases: ["GameBuddies Web", "GameBuddies Browser"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "pixreveal",
    slug: "browser",
    name: "Web Browser Edition (Default)",
    shortDescription: "Daily visual pixel puzzle played directly in any modern browser.",
    description:
      "Instant daily image deduction game running in HTML5. Features daily challenges, streak tracking, mobile touchscreen zoom, and shareable results.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://pixreveal.com",
    },
    installMethod: "browser",
    installConfig: {
      browser: {
        playUrl: "https://pixreveal.com",
      },
    },
    features: ["Singleplayer", "Daily Challenges", "Leaderboards", "Instant Play", "Mobile Compatible"],
    tags: ["Browser", "Puzzle", "Pixel Art", "Daily"],
    aliases: ["Pixreveal Web", "Pixreveal Browser"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "freedoom",
    slug: "gzdoom",
    name: "Freedoom + GZDoom (Default)",
    shortDescription: "Modern OpenGL/Vulkan source port with dynamic lighting and mouselook.",
    description:
      "The recommended way to experience Freedoom: Phase 1, Phase 2, and FreeDM. Bundled with GZDoom for uncapped framerates, widescreen 4K resolutions, ambient lighting, and controller support.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://freedoom.github.io",
      github: "https://github.com/freedoom/freedoom",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "ZDoom/gzdoom",
        assetPattern: "gzdoom-.*-windows\\.zip$",
        exeHint: "gzdoom",
        overlayUrl: "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
        overlayFileName: "freedoom-0.13.0.zip",
        note: "Bundles GZDoom engine with Freedoom Phase 1 & 2 game assets.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Deathmatch", "Mod Support", "Controller Support", "OpenGL / Vulkan"],
    tags: ["Boomer Shooter", "Retro FPS", "GZDoom", "Open Source"],
    aliases: ["Freedoom GZDoom", "Freedoom Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "freedoom",
    slug: "dsda-doom",
    name: "Freedoom + DSDA-Doom (Speedrunning)",
    shortDescription: "Strict vanilla-compatible speedrunning engine with demo recording.",
    description:
      "For competitive speedrunners and classic purists. DSDA-Doom provides cycle-accurate Doom compatibility, advanced demo analysis tools, and strict vanilla physics.",
    type: "community",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://github.com/kraflab/dsda-doom",
      github: "https://github.com/kraflab/dsda-doom",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "kraflab/dsda-doom",
        assetPattern: "dsda-doom-.*-win64\\.zip$",
        exeHint: "dsda-doom",
        overlayUrl: "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
        overlayFileName: "freedoom-0.13.0.zip",
        note: "Bundles DSDA-Doom speedrunning engine with Freedoom IWADs.",
      },
    },
    features: ["Singleplayer", "Demo Recording", "Speedrunning", "Vanilla Physics"],
    tags: ["DSDA", "Speedrunning", "Vanilla"],
    aliases: ["Freedoom DSDA"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "world-of-sea-battle",
    slug: "official",
    name: "Official Standalone Launcher (Default)",
    shortDescription: "Official direct launcher edition with auto-updates and dedicated server browser.",
    description:
      "The official PC client for World of Sea Battle. Includes direct launcher updates, high-resolution textures, and full guild fleet synchronization.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.worldofseabattle.com",
      discord: "https://discord.gg/worldofseabattle",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://installer.launcher.xsolla.com/xlauncher-builds/xsolla-launcher-update/786ad960-bdf8-464a-94ff-1c326c963292/bin/installer.exe",
        fileName: "WorldOfSeaBattle-Setup.exe",
        sizeMB: 45,
      },
    },
    features: ["Multiplayer", "MMORPG", "Open World", "Trade Economy", "PvP Battles"],
    tags: ["Naval", "Pirates", "MMO", "Standalone"],
    aliases: ["WOSB Standalone", "World of Sea Battle Launcher"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "world-of-sea-battle",
    slug: "steam",
    name: "Steam Edition",
    shortDescription: "Official Steam release with Steam Deck support and Steam Wallet integration.",
    description:
      "Play World of Sea Battle via Steam with seamless cloud synchronization, Steam Community hubs, and Steam Deck verification.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.worldofseabattle.com",
      discord: "https://discord.gg/worldofseabattle",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "2579170",
      },
    },
    features: ["Multiplayer", "MMORPG", "Steam Integration", "Steam Deck"],
    tags: ["Naval", "Steam", "MMO"],
    aliases: ["WOSB Steam", "World of Sea Battle Steam"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "old-school-runescape",
    slug: "runelite",
    name: "RuneLite Enhanced Client (Default)",
    shortDescription: "The premier open-source client with 117 HD graphics, quest helpers, and plugins.",
    description:
      "RuneLite is the officially approved, community-built client for Old School RuneScape. Features the 117 HD graphics plugin, GPU rendering, tile indicators, quest helper guides, and an enormous plugin hub.",
    type: "community",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://runelite.net/",
      github: "https://github.com/runelite/runelite",
      discord: "https://discord.gg/runelite",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://github.com/runelite/launcher/releases/download/2.7.3/RuneLiteSetup.exe",
        fileName: "RuneLiteSetup.exe",
        sizeMB: 35,
      },
    },
    features: ["Multiplayer", "117 HD Graphics", "Plugin Hub", "Quest Helper", "GPU Rendering"],
    tags: ["OSRS", "RuneLite", "Open Source", "HD"],
    aliases: ["RuneLite", "OSRS RuneLite"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "old-school-runescape",
    slug: "official",
    name: "Official Jagex Launcher Edition",
    shortDescription: "Official Jagex account launcher with instant 1-click RuneLite switching.",
    description:
      "The official launcher managed by Jagex. Supports multi-character Jagex accounts, automatic game updates, and official client launches.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.jagex.com/launcher",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://www.jagex.com/launcher",
        fileName: "JagexLauncherInstaller.exe",
        sizeMB: 25,
      },
    },
    features: ["Multiplayer", "Official Launcher", "Jagex Account", "Auto Updates"],
    tags: ["Jagex", "Official", "OSRS"],
    aliases: ["Jagex Launcher OSRS"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "old-school-runescape",
    slug: "steam",
    name: "Steam Edition",
    shortDescription: "Official Steam client with Steam achievements and Steam Deck verification.",
    description:
      "Play Old School RuneScape directly through Steam with full Steam achievements, trading cards, and Steam Deck verification.",
    type: "official",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://oldschool.runescape.com",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1343370",
      },
    },
    features: ["Multiplayer", "Steam Achievements", "Steam Deck", "Trading Cards"],
    tags: ["Steam", "OSRS", "MMORPG"],
    aliases: ["OSRS Steam"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "swtor",
    slug: "official",
    name: "Steam Edition (Default)",
    shortDescription: "Official Steam release with automatic updates and Steam Deck support.",
    description:
      "The official Steam client for Star Wars: The Old Republic. Includes 64-bit client optimization, DirectX 11, and seamless Steam Wallet integration.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.swtor.com",
      discord: "https://discord.gg/swtor",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1286830",
      },
    },
    features: ["Multiplayer", "MMORPG", "64-bit Client", "Steam Integration", "Steam Deck"],
    tags: ["Star Wars", "BioWare", "Steam", "MMO"],
    aliases: ["SWTOR Steam"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "swtor",
    slug: "standalone",
    name: "Official Standalone Launcher Edition",
    shortDescription: "Direct PC installer managed by Broadsword and Electronic Arts.",
    description:
      "Direct standalone installer for SWTOR with integrated BitRaider streaming support and direct account portal integration.",
    type: "official",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.swtor.com",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://www.swtor.com",
        fileName: "SWTOR_setup.exe",
        sizeMB: 50,
      },
    },
    features: ["Multiplayer", "MMORPG", "Standalone Client"],
    tags: ["Star Wars", "Standalone", "MMO"],
    aliases: ["SWTOR Standalone", "SWTOR Direct"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "dune-legacy",
    slug: "modern-engine",
    name: "Dune Legacy Modern Engine (Default)",
    shortDescription: "Open-source 64-bit engine with drag-box selection, HD zoom, and multiplayer.",
    description:
      "Modernized open-source client for Dune II: Battle for Arrakis. Includes drag-box multi-unit selection, right-click move/attack orders, high-res widescreen graphics, and online multiplayer.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://dunelegacy.sourceforge.net/",
      github: "https://github.com/henricj/dunelegacy",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        // dunelegacy/dunelegacy 404s; henricj's fork is the maintained one and
        // is what the SourceForge project page points at for Windows builds.
        repo: "henricj/dunelegacy",
        /*
         * Plain x64 rather than the -avx2 build beside it: AVX2 needs CPU
         * support the launcher cannot check before installing, and the plain
         * build runs everywhere. "-win64" never existed in this repo's names.
         */
        assetPattern: "^dunelegacy-x64-v.*\\.zip$",
        exeHint: "dunelegacy",
        note: "Installs Dune Legacy modern engine with full campaign and skirmish support.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Mod Support", "Modern Controls", "High Resolution"],
    tags: ["RTS", "Classic", "Dune", "Open Source"],
    aliases: ["Dune Legacy Default"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "mrboom",
    slug: "standalone",
    name: "Mr. Boom (Portable Standalone Edition)",
    shortDescription: "Portable DRM-free open-source build for PC with zero install footprint.",
    description:
      "The lightweight standalone open-source release of Mr. Boom. Provides instant portable 8-player party action with native gamepad support and zero installation dependencies.\n\nNo longer downloadable: the author's host stopped serving this build, and upstream now publishes source only. Install the RetroArch edition instead — same game, from the libretro core that is still maintained.",
    type: "official",
    /*
     * Archived because the download is gone, not because the edition was
     * retired on purpose. mrboom.mumble.info answers every request with 421 —
     * the parent domain is alive but this vhost has been removed — which is
     * what the catalog version probe reports as "broken — HTTP 421". Kept
     * listed rather than deleted so the history is visible, but it can no
     * longer be the default install route.
     */
    status: "archived",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "http://mrboom.mumble.info/",
      github: "https://github.com/Javanaise/mrboom-libretro",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "http://mrboom.mumble.info/",
        fileName: "mrboom_win64.zip",
        exeHint: "mrboom",
        note: "Standalone open-source portable 8-player Bomberman package.",
      },
    },
    requirements: {
      min: "1.0 GHz CPU / 512 MB RAM / DirectX 9.0c GPU / 100 MB storage",
      recommended: "Dual-Core 2.0 GHz / 2 GB RAM / USB Gamepads",
    },
    features: ["Multiplayer", "Local Co-Op", "Portable", "DRM-Free", "8-Player Support"],
    tags: ["Standalone", "Open Source", "Party", "Bomberman"],
    aliases: ["Mr. Boom Standalone", "Mr. Boom Portable"],
    version: "v5.5",
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "mrboom",
    slug: "steam",
    name: "Mr. Boom (Steam Edition)",
    shortDescription: "Official Steam release with cloud stats, automatic updates, and Steam Deck integration.",
    description:
      "The official Steam release of Mr. Boom. Supports 8 simultaneous controllers, netplay, AI bots, and full Steam Deck verification.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "http://mrboom.mumble.info/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1351050",
      },
    },
    requirements: {
      min: "1.0 GHz CPU / 512 MB RAM / DirectX 9.0c GPU / 100 MB storage",
      recommended: "Dual-Core 2.0 GHz / 2 GB RAM / USB Gamepads",
    },
    features: ["Multiplayer", "Local Co-Op", "AI Bots", "Controller Support", "Steam Deck"],
    tags: ["Bomberman", "Party", "Steam", "Retro"],
    aliases: ["Mr. Boom Steam"],
    version: "Steam Release",
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "openmohaa",
    slug: "openmohaa",
    name: "OpenMOHAA Modern Engine (Default)",
    shortDescription: "Modern 64-bit id Tech 3 engine with widescreen 4K and raw input.",
    description:
      "The recommended modern engine for Medal of Honor: Allied Assault. Brings 64-bit performance, widescreen resolutions, modern raw mouse input, and full singleplayer/multiplayer compatibility.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://openmohaa.org",
      github: "https://github.com/openmoh/openmohaa",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "locate-then-zip",
        // openmohaa/openmohaa 404s — the project lives under the openmoh org.
        repo: "openmoh/openmohaa",
        /*
         * Upstream names these "windows-x64", not "win64", so the old pattern
         * matched nothing even once the repo was right. Anchored to .zip so the
         * -pdb.zip symbol bundle and the .msi installer are both skipped.
         */
        assetPattern: "openmohaa-.*-windows-x64\\.zip$",
        exeHint: "openmohaa",
        note: "Requires base MOHAA game assets (Main/pak*.pk3), then overlays modern 64-bit OpenMOHAA binaries.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "64-bit Engine", "Widescreen Support", "Raw Input"],
    tags: ["WWII", "Shooter", "Open Source", "Classic"],
    aliases: ["OpenMOHAA Default"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "metal-slug-remake",
    slug: "remake",
    name: "Community Remake Edition (Default)",
    shortDescription: "Portable 60 FPS arcade run-and-gun with 2-player local co-op.",
    description:
      "Complete 2D arcade side-scrolling experience with full controller support, authentic SNK weapon audio, and 2-player local co-op.",
    type: "official",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.snk-corp.co.jp/",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://archive.org",
        fileName: "MetalSlugRemake.zip",
        sizeMB: 150,
      },
    },
    features: ["Singleplayer", "Co-Op", "Controller Support", "Pixel Art", "High Framerate"],
    tags: ["Run and Gun", "Arcade", "Pixel Art", "2D"],
    aliases: ["Metal Slug PC Remake"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "microsoft-allegiance",
    slug: "freeallegiance",
    name: "FreeAllegiance Standalone Client (Default)",
    shortDescription: "Official standalone community client maintained by FreeAllegiance with custom texture options.",
    description:
      "The definitive standalone release of Microsoft Allegiance maintained by the FreeAllegiance community. Includes modern wide-aspect cockpit resolutions, integrated server browser, squad tournament tools, and zero DRM.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.freeallegiance.org/",
      discord: "https://discord.gg/freeallegiance",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://www.freeallegiance.org/download/Allegiance_Setup.exe",
        fileName: "Allegiance_Setup.exe",
        exeHint: "Allegiance",
        note: "Official FreeAllegiance standalone installer.",
      },
    },
    requirements: {
      min: "Dual-Core 2.0 GHz / 2 GB RAM / DirectX 9.0c GPU / 2 GB storage",
      recommended: "Quad-Core CPU / 4 GB RAM / Dedicated GPU / Flight Joystick / HOTAS",
    },
    features: ["Multiplayer", "RTS Commander Mode", "Space Flight Sim", "Dedicated Servers", "Voice Chat", "Joystick Support"],
    tags: ["Space Sim", "RTS", "Open Source", "Free to Play"],
    aliases: ["FreeAllegiance Standalone", "Allegiance Direct"],
    version: "v1.4",
    verificationLevel: "playbound_verified",
    faq: [
      {
        q: "Does this connect to the same multiplayer servers as Steam?",
        a: "Yes! Both the standalone client and Steam edition connect to the same central FreeAllegiance server lobby and match servers.",
      },
    ],
  },
  {
    gameSlug: "microsoft-allegiance",
    slug: "steam",
    name: "Microsoft Allegiance (Steam Edition)",
    shortDescription: "Official Steam release with automatic updates and community server browser integration.",
    description:
      "Play Microsoft Allegiance via Steam with automatic updates, server browser integration, and full flight joystick/HOTAS support.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.freeallegiance.org/",
      discord: "https://discord.gg/freeallegiance",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "700480",
      },
    },
    requirements: {
      min: "Dual-Core 2.0 GHz / 2 GB RAM / DirectX 9.0c GPU / 2 GB storage",
      recommended: "Quad-Core CPU / 4 GB RAM / Dedicated GPU / Flight Joystick / HOTAS",
    },
    features: ["Multiplayer", "RTS Commander Mode", "Space Flight Sim", "Dedicated Servers", "Voice Chat"],
    tags: ["Space Sim", "RTS", "Steam", "Open Source"],
    aliases: ["Allegiance Steam", "FreeAllegiance Steam"],
    version: "Steam Release",
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "holocure",
    slug: "playbound",
    name: "HoloCure: Multiplayer (Experimental)",
    shortDescription:
      "Online co-op for HoloCure over a shared PlayBound Connect network. No Steam, no port forwarding, no Hamachi to set up yourself. Experimental — expect occasional crashes.",
    description:
      "Adds PippleCultist's HoloCure Multiplayer Mod to HoloCure — Save the Fans!, so you can run stages co-op with friends. PlayBound installs the Aurie mod loader and the mod for you in one click.\n\nThe mod plays over LAN: one player hosts a session and everyone else finds it on the same network. PlayBound Connect supplies that network. Click Join Game in a party and Connect puts every member on one shared segment, then points HoloCure at it, so a LAN session works across the internet without you configuring anything. In game it is Play → Multiplayer → use the saved network adapter, then Host LAN Session for the leader and Join LAN Session for everyone else.\n\nThis is experimental community software, not an official HoloCure feature. The mod's author notes it may have occasional crashes since a lot is modified in the game to get networking working. Your saves remain completely safe in %LOCALAPPDATA%\\HoloCure and you can switch to unmodded vanilla HoloCure at any time.",
    type: "community",
    // Deliberately NOT the default. The mod is self-described as crash-prone,
    // so the vanilla edition stays the one-click path for anyone who just
    // wants to play HoloCure, and this is strictly opt-in.
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://kay-yu.itch.io/holocure",
      wiki: "https://holocure.wiki.gg/",
      // Was https://github.com/Kay-Yu-Mods/HoloCure-Multiplayer, which does not
      // exist (404). The real multiplayer mod is PippleCultist's, below.
      github: "https://github.com/PippleCultist/HoloCureMultiplayerMod",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        /*
         * Our own mirror, not itch.io.
         *
         * The itch path was a page scrape for `data-upload_id`, a POST for a
         * signed URL, then a download — and itch began returning 403 on that
         * last step, which failed every install with no fallback. The scrape
         * was always going to break; it depends on markup itch never promised
         * us. This is the same 0.7 build (5/7/2025), checksummed.
         */
        kind: "direct-zip",
        url: "https://mirror.playbound.club/games/holocure/HoloCure-0.7.1746645739.zip",
        /*
         * Checksum lives on the Artifact record, not here.
         *
         * The launcher verifies against `resolved.artifact.sha256` from
         * /api/downloads — its one call site never passes an expected digest
         * from the recipe — so a sha256 in this object would be silently
         * ignored, which is worse than none. For this build it is
         * e304d2a92e6e65b32f829f943448096c874977d55b5dbf2cea8fc808d9330f4c
         * (226 MB); put it on the artifact so both the launcher download and
         * the VPS archive transfer check it.
         */
        versionLabel: "0.7.1746645739",
        fileName: "HoloCure.zip",
        exeHint: "HoloCure|holocure",
        knownExePaths: [
          "%LOCALAPPDATA%\\HoloCure\\HoloCure.exe",
          "%PROGRAMFILES%\\HoloCure\\HoloCure.exe",
          "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
          "~/PlayBound/Games/holocure/HoloCure.exe",
          "~/.local/share/HoloCure/HoloCure.exe",
          "~/.steam/steam/steamapps/common/HoloCure/HoloCure.exe",
        ],
        note: "Downloads and extracts official HoloCure standalone build and configures PlayBound multiplayer automatically in 1 click.",
        // Layout is upstream's and is not negotiable — Aurie only loads DLLs
        // from mods/Aurie, and the mod only finds emotes at
        // MultiplayerMod/Emotes with no folder in between.
        modLoader: {
          kind: "aurie",
          testedGameVersion: "0.7.1746645739",
          files: [
            {
              url: "https://github.com/AurieFramework/Aurie/releases/download/v2.0.2/AurieCore.dll",
              fileName: "AurieCore.dll",
              dest: "mods/Native",
            },
            {
              /*
               * YYToolkit — the GameMaker interface every one of the mods below
               * asks Aurie for.
               *
               * mods/Aurie, NOT mods/Native, even though it is a framework
               * rather than a mod. Native modules are mapped raw at process
               * attach and never run the Aurie module lifecycle, so a
               * mods/Native YYToolkit loads and then registers nothing: the
               * three mods below fail MdpMapImage with AURIE_EXTERNAL_ERROR
               * (their imports resolve against YYToolkit), Aurie logs
               * "Failed to get YYTK interface", and CallbackManagerMod is
               * purged with AURIE_MODULE_DEPENDENCY_NOT_RESOLVED. From
               * mods/Aurie it exports YYTK_ZeusPrivate and YYTK_ZeusMain and
               * all three mods map clean. Verified against aurie.log on a real
               * install, both ways.
               *
               * v5 specifically: HoloCureMultiplayerMod v1.4.1's notes say
               * "Updated for YYTK v5 (WARNING: May become incompatible with
               * previous versions of YYTK)". v5.0.0c is flagged prerelease
               * upstream but is the only v5 published, so pinning it is
               * deliberate rather than an oversight. x64 to match AurieCore.dll
               * above — the -x86 builds pair with AurieCore-x86.dll.
               */
              url: "https://github.com/AurieFramework/YYToolkit/releases/download/v5.0.0c/YYToolkit.dll",
              fileName: "YYToolkit.dll",
              dest: "mods/Aurie",
            },
            {
              url: "https://github.com/AurieFramework/Aurie/releases/download/v2.0.2/AuriePatcher.exe",
              fileName: "AuriePatcher.exe",
              dest: "mods",
            },
            {
              url: "https://github.com/PippleCultist/HoloCureMultiplayerMod/releases/download/v1.4.1/HolocureMultiplayerMod.dll",
              fileName: "HolocureMultiplayerMod.dll",
              dest: "mods/Aurie",
            },
            {
              url: "https://github.com/PippleCultist/HoloCureMultiplayerMod/releases/download/v1.4.1/HoloCureMenuMod.dll",
              fileName: "HoloCureMenuMod.dll",
              dest: "mods/Aurie",
            },
            {
              url: "https://github.com/PippleCultist/HoloCureMultiplayerMod/releases/download/v1.4.1/CallbackManagerMod.dll",
              fileName: "CallbackManagerMod.dll",
              dest: "mods/Aurie",
            },
            {
              url: "https://github.com/PippleCultist/HoloCureMultiplayerMod/releases/download/v1.4.1/Emotes.zip",
              fileName: "Emotes.zip",
              dest: "MultiplayerMod",
              extract: true,
              extractedMarker: "Emotes",
            },
          ],
          patcherFileName: "AuriePatcher.exe",
          patcherDest: "mods",
          nativeDllFileName: "AurieCore.dll",
          nativeDllDest: "mods/Native",
        },
      },
    },
    features: [
      "Multiplayer",
      "Sandbox Mode",
      "Character Expansions",
      "Discord Rich Presence",
      "Verified Mod Pack",
      "Automatic Updates",
      "PlayBound Integration",
      "Controller Support",
      "Steam Deck Playable",
    ],
    tags: [
      "Co-op",
      "Sandbox",
      "Custom Characters",
      "Verified Mods",
      "PlayBound Edition",
    ],
    aliases: ["HoloCure PlayBound", "HoloCure Multiplayer", "HoloCure Enhanced"],
    verificationLevel: "playbound_verified",
    branding: {
      heroImage: "/games/holocure/editions/playbound.webp",
      screenshots: [
        "/games/holocure/editions/playbound.webp",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_0b4a50d12f737a522960ba3b3229546f536ff57f.1920x1080.jpg",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_a393d743965dc088d53d97c493ee6728d74b384d.1920x1080.jpg",
      ],
    },
    faq: [
      {
        q: "What is included in the HoloCure PlayBound Edition?",
        a: "The PlayBound Edition packages verified community mods into a single one-click install: online co-op Multiplayer, full Sandbox/testing mode, community Character Expansions, Discord Rich Presence, and QoL utilities (random character picker & quick restarts).",
      },
      {
        q: "Can I install these mods individually?",
        a: "Yes. Every mod included in the PlayBound Edition is also listed as an individual mod option in the Mods tab so you can enable, configure, or remove specific mods independently.",
      },
      {
        q: "Will this affect my existing HoloCure save files?",
        a: "No. HoloCure saves are stored separately in %LOCALAPPDATA%\\HoloCure (save_n.dat) and are never overwritten or deleted by PlayBound.",
      },
      {
        q: "Can I still play the vanilla single-player edition?",
        a: "Yes. The standard unmodded Official Edition remains available and can be launched or selected at any time.",
      },
    ],
  },
  {
    gameSlug: "holocure",
    slug: "official",
    name: "Official Vanilla Edition",
    shortDescription: "Standard unmodded HoloCure, straight from the official release.",
    description:
      "The original, pure single-player HoloCure experience directly from official distributions without modifications.",
    type: "official",
    status: "active",
    visibility: "public",
    // The default on purpose: the multiplayer edition is experimental
    // community software, so anyone who just wants to play HoloCure lands on
    // the unmodified game.
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://kay-yu.itch.io/holocure",
      wiki: "https://holocure.wiki.gg/",
    },
    // Asset hashes verified live against the Steam appdetails API for appid
    // 2420510. The previous two URLs both 404'd, which left this edition's
    // card with no cover at all — EditionCard falls back heroImage → logo →
    // game.coverImage, and a dead URL satisfies the first branch without
    // rendering. Re-check these if the card ever goes blank again.
    branding: {
      heroImage:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_0b4a50d12f737a522960ba3b3229546f536ff57f.1920x1080.jpg",
      screenshots: [
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_0b4a50d12f737a522960ba3b3229546f536ff57f.1920x1080.jpg",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_a393d743965dc088d53d97c493ee6728d74b384d.1920x1080.jpg",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2420510/ss_f678c4dd81fd2c42b0682cba66317e6914bde75b.1920x1080.jpg",
      ],
    },
    /*
     * One click, same as the multiplayer edition.
     *
     * This was `official_download`, which sends the player to itch.io to fetch
     * and unpack the game themselves — a worse experience than the experimental
     * edition beside it, on the edition most people should be choosing. It is
     * the identical archive; the multiplayer edition is that plus a mod loader,
     * so there is no reason the plain one should be the harder install.
     */
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/games/holocure/HoloCure-0.7.1746645739.zip",
        versionLabel: "0.7.1746645739",
        fileName: "HoloCure.zip",
        exeHint: "HoloCure|holocure",
        knownExePaths: [
          "%LOCALAPPDATA%\\HoloCure\\HoloCure.exe",
          "%PROGRAMFILES%\\HoloCure\\HoloCure.exe",
          "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
          "~/PlayBound/Games/holocure/HoloCure.exe",
        ],
        note: "Downloads and extracts the official HoloCure standalone build in one click. No mods.",
      },
    },
    features: ["Singleplayer", "Controller Support", "Steam Deck Playable"],
    tags: ["Vanilla", "Official"],
    aliases: ["Vanilla", "Standard"],
    verificationLevel: "official",
  },
  {
    gameSlug: "freelancer",
    slug: "freelancer-hd-fluf",
    name: "Freelancer: HD Edition (FLUF Enhanced)",
    shortDescription:
      "HD overhaul, widescreen UI, 60+ FPS engine and the FLUF framework. Requires your own copy of Freelancer.",
    description:
      "The definitive modern way to experience Freelancer. Bundles high-resolution textures, high-polygon ship models, a modernised widescreen interface, and TheStarport's FLUF (Freelancer Universal Framework) for crash prevention, modern memory management and solid Windows 10/11 compatibility.\n\nYou need your own copy of Freelancer installed. PlayBound does not distribute the game — the launcher asks you to point at your existing install, then applies this edition on top of it. Your original files are left intact.",
    type: "remaster",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://the-starport.net",
      github: "https://codeberg.org/TheStarport/FLUF",
      wiki: "https://freelancer.fandom.com",
    },
    // No branding art: these pointed at a Resources/Screenshots folder on a
    // "master" branch of FLHDE/freelancer-hd-edition-installer. That repo's
    // default branch is "main" and it has no such folder, so all three 404'd
    // and left an empty card. EditionCard degrades to game.coverImage /
    // GameArt when branding is absent.
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        // Owner-supplied, matching the EverQuest Titanium editions: PlayBound
        // never ships Freelancer, it applies this on top of a copy the player
        // already has. See launcherInstall.ts for the base recipe.
        kind: "locate-then-zip",
        requiresBaseDir: true,
        exeHint: "Freelancer|FL",
        versionLabel: "HD Edition + FLUF",
        note: "Requires your own copy of Freelancer. PlayBound never ships the game — it copies your install and applies the HD Edition and FLUF on top.",
        steps: [
          {
            platform: "all",
            text: "Install Freelancer from your own disc or backup. PlayBound does not distribute the game.",
          },
          {
            platform: "all",
            text: "Choose Install here and point PlayBound at that Freelancer folder when prompted.",
          },
          {
            platform: "all",
            text: "PlayBound copies it into your library and layers the HD Edition and FLUF on the copy, leaving your original untouched.",
          },
        ],
      },
    },
    features: [
      "HD Textures",
      "Widescreen Support",
      "60+ FPS Engine",
      "FLUF Framework",
      "High-Poly Ships",
      "Singleplayer Campaign",
      "Multiplayer Servers",
    ],
    tags: ["Remaster", "HD Overhaul", "Widescreen", "FLUF", "Modernized"],
    aliases: ["FLHD", "FLUF", "HD Edition"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "freelancer",
    slug: "freelancer-vanilla",
    name: "Freelancer (Vanilla / Classic)",
    shortDescription:
      "The original 2003 release, unmodified. Requires your own copy of Freelancer.",
    description:
      "The pure 2003 Digital Anvil experience, preserving the original presentation and mechanics.\n\nYou need your own copy of Freelancer. PlayBound does not distribute the game — this edition exists so the launcher can track and launch an install you already own alongside the modded editions.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://the-starport.net",
      wiki: "https://freelancer.fandom.com",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        // Owner-supplied. Vanilla Freelancer has to come from the player's own
        // copy — PlayBound locates it rather than distributing it.
        kind: "locate-then-zip",
        requiresBaseDir: true,
        exeHint: "Freelancer|FL",
        versionLabel: "1.1 Classic",
        note: "Classic 2003 unmodded experience. Requires your own copy of Freelancer.",
      },
    },
    features: ["Singleplayer Campaign", "Multiplayer Servers", "Classic Graphics"],
    tags: ["Vanilla", "Classic", "Original"],
    aliases: ["Vanilla", "Retail"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "ur-quan-masters",
    slug: "uqm-playbound-edition",
    name: "The Ur-Quan Masters — PlayBound Edition",
    shortDescription:
      "The complete Star Control II remaster with 3DO voice acting, 3DO music, official remix packs, and modern controls.",
    description:
      "The definitive way to experience Star Control II. Pre-configures the full UQM content package, the complete legendary 3DO voice acting recordings for all alien species, remastered 3DO orchestral soundtrack, official project add-on packs (Super Melee!, Neutral Aliens, Ur-Quan Hierarchy, New Alliance of Free Stars), and optimized gamepad controller configurations.",
    type: "remaster",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://urquanmasters.com",
      wiki: "https://wiki.uqm.stack.nl",
      github: "https://github.com/uqm-fork/uqm",
    },
    // No branding art: the sc2.sourceforge.net screenshot URLs previously here
    // all 404'd, which renders an empty card rather than falling through.
    // EditionCard degrades to game.coverImage / GameArt when branding is
    // absent, so leaving this off looks correct until real art is supplied.
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        // Upstream ships a win32 installer in the 0.8 directory; there is no
        // 0.8.0 zip and this URL 404'd. See launcherInstall.ts for the same fix.
        kind: "direct-installer",
        url: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-win32.exe",
        fileName: "uqm-0.8-win32.exe",
        exeHint: "uqm",
        versionLabel: "0.8 Remaster",
        note: "Includes full game content package, 3DO voice acting, and remastered music.",
      },
    },
    features: [
      "3DO Full Voice Acting",
      "Remastered 3DO Music",
      "Official Remix Add-On Packs",
      "Super Melee! Head-to-Head Combat",
      "Gamepad & Steam Deck Support",
      "40+ Hour Space RPG Story",
    ],
    tags: ["Remaster", "3DO Voice Acting", "Remix Packs", "Super Melee", "Official"],
    aliases: ["UQM", "Star Control 2", "PlayBound Edition"],
    verificationLevel: "official",
  },
  {
    gameSlug: "ur-quan-masters",
    slug: "uqm-classic",
    name: "The Ur-Quan Masters (Classic DOS)",
    shortDescription: "The pure 1992 Star Control II experience with original DOS music and sound.",
    description:
      "Original 1992 Star Control II presentation with classic MIDI sound and unmodded balance, running natively on modern operating systems.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://urquanmasters.com",
      wiki: "https://wiki.uqm.stack.nl",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-win32.exe",
        fileName: "uqm-0.8-win32.exe",
        exeHint: "uqm",
        versionLabel: "0.8 Classic",
        note: "Classic 1992 Star Control II presentation.",
      },
    },
    features: ["Classic Story Campaign", "Super Melee! Combat", "Classic DOS Audio"],
    tags: ["Vanilla", "Classic", "DOS"],
    aliases: ["Classic", "DOS"],
    verificationLevel: "official",
  },

  /* ── Shattered Pixel Dungeon ────────────────────────────────────────────
   * SPD is GPLv3 and has a large family of forks that are full standalone
   * games rather than mods — each ships its own desktop build, keeps its own
   * saves, and runs alongside vanilla. That makes them editions.
   *
   * The "official" entry below is NOT optional. listEditionsForGame() only
   * synthesizes a virtual official edition when a game has zero stored
   * editions, so adding the forks alone would remove vanilla Shattered Pixel
   * Dungeon as an install option entirely.
   */
  {
    gameSlug: "shattered-pixel-dungeon",
    slug: "official",
    name: "Shattered Pixel Dungeon",
    shortDescription: "The original roguelike by Evan Debenham, as released upstream.",
    description:
      "Shattered Pixel Dungeon is a traditional roguelike dungeon crawler with randomized levels, dozens of enemies and hundreds of items, built on the source of Watabou's original Pixel Dungeon. This is the unmodified game from its own developer.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://shatteredpixel.com",
      github: "https://github.com/00-Evan/shattered-pixel-dungeon",
      wiki: "https://pixeldungeon.fandom.com/wiki/Shattered_Pixel_Dungeon",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "00-Evan/shattered-pixel-dungeon",
        assetPattern: "Windows\\.zip$",
        exeHint: "ShatteredPD|Shattered",
      },
    },
    features: ["Singleplayer", "Daily Runs", "Controller Support"],
    tags: ["Roguelike", "Open Source", "Vanilla"],
    aliases: ["SPD", "Shattered"],
    verificationLevel: "official",
  },
  {
    gameSlug: "shattered-pixel-dungeon",
    slug: "rat-king-adventure",
    name: "Rat King Adventure",
    shortDescription: "Sprawling fork with far more heroes, items and mechanics than vanilla.",
    description:
      "Rat King Adventure is a long-running fork of Shattered Pixel Dungeon that expands well past the original's scope — extra hero classes, a much larger item pool, reworked mechanics and new content layered throughout the dungeon. It installs and saves separately, so it never disturbs a vanilla run.\n\nDesktop builds are Java, so PlayBound installs a Java runtime for you if one isn't already present.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      github: "https://github.com/TrashboxBobylev/Rat-King-Adventure",
      website: "https://github.com/TrashboxBobylev/Rat-King-Adventure/releases",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-jar",
        repo: "TrashboxBobylev/Rat-King-Adventure",
        // Releases ship android-debug.apk, android-release.apk and
        // desktop-<version>.jar side by side; anchor so only the desktop jar
        // can ever match.
        assetPattern: "^desktop-[\\d.]+\\.jar$",
        exeHint: "Rat-King-Adventure|desktop",
        note: "Java desktop build. PlayBound installs a Java runtime if needed.",
      },
    },
    features: ["Singleplayer", "Daily Runs"],
    tags: ["Roguelike", "Fork", "Open Source", "Expanded"],
    aliases: ["RKA", "Rat King"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "shattered-pixel-dungeon",
    slug: "rkpd2",
    name: "Rat King Pixel Dungeon 2",
    shortDescription: "Deliberately generous fork — stronger heroes, a more forgiving run.",
    description:
      "Rat King Pixel Dungeon 2 rebuilds Shattered's Rat King Dungeon April Fools mod as a full game. Heroes are dramatically buffed and the run is intentionally easier than vanilla, which makes it a good way in for players who bounce off Shattered's difficulty. Installs and saves separately from vanilla.\n\nDesktop builds are Java, so PlayBound installs a Java runtime for you if one isn't already present.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      github: "https://github.com/Zrp200/rkpd2",
      website: "https://zrp200.itch.io/rkpd2",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-jar",
        repo: "Zrp200/rkpd2",
        // Releases carry both a stable jar and an -INDEV jar. Requiring the
        // version to run straight into ".jar" excludes the INDEV build, which
        // is a work-in-progress and should not be what players get.
        assetPattern: "^rkpd2-[\\d.]+\\.jar$",
        exeHint: "rkpd2",
        note: "Java desktop build. PlayBound installs a Java runtime if needed.",
      },
    },
    features: ["Singleplayer", "Daily Runs"],
    tags: ["Roguelike", "Fork", "Open Source", "Beginner Friendly"],
    aliases: ["RKPD2", "Rat King Pixel Dungeon"],
    verificationLevel: "community_verified",
  },
  // --- Space Station 14 ---
  {
    gameSlug: "space-station-14",
    slug: "official",
    name: "Space Station 14 Official",
    shortDescription: "Official Space Wizards Federation client and server hub.",
    description:
      "The official release of Space Station 14. Installs the SS14 launcher, which automatically manages server assets and game builds for all official and community stations.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://spacestation14.com/",
      github: "https://github.com/space-wizards/space-station-14",
      discord: "https://discord.gg/ss14",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "space-wizards/SS14.Launcher",
        assetPattern: "SS14.Launcher_Windows\\.zip$",
        exeHint: "SS14.Launcher.exe",
      },
    },
    features: ["Multiplayer", "Community Servers", "Mod Support", "Cross-Platform"],
    tags: ["Simulation", "Sandbox", "Open Source", "Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "space-station-14",
    slug: "frontier-station",
    name: "Frontier Station",
    shortDescription: "Open-space persistent exploration and trading fork of SS14.",
    description:
      "Frontier Station turns Space Station 14 into an open-universe sandbox RPG where players own personal starships, mine asteroid belts, explore abandoned derelicts, and trade across orbital stations.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://github.com/Space-Wizards/space-station-14",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "space-wizards/SS14.Launcher",
        assetPattern: "SS14.Launcher_Windows\\.zip$",
        exeHint: "SS14.Launcher.exe",
      },
    },
    features: ["Multiplayer", "Persistent Universe", "Open World", "Space Exploration"],
    tags: ["Fork", "Open Space", "RPG", "Exploration"],
    verificationLevel: "community_verified",
  },
  // --- Marathon 2 / Aleph One ---
  {
    gameSlug: "alephone",
    slug: "official",
    name: "Marathon 2: Durandal",
    shortDescription: "The complete Marathon 2 scenario bundled with the Aleph One engine.",
    description:
      "Bungie's 1995 sequel remastered on the open-source Aleph One engine with modern widescreen resolutions, 60fps mouselook, and cross-platform multiplayer.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://alephone.lhowon.org/",
      github: "https://github.com/Aleph-One-Marathon/alephone",
      discord: "https://discord.gg/vK2eQ9h",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Aleph-One-Marathon/alephone",
        // The release also has Marathon2-*-Exe-Win.zip (engine only). Match
        // only the full engine + scenario bundle for a first install.
        assetPattern: "^Marathon2-\\d{8}-Win\\.zip$",
        exeHint: "Marathon2.exe",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Mod Support", "Open Source"],
    tags: ["FPS", "Sci-Fi", "Classic", "Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "alephone",
    slug: "marathon-1",
    name: "Marathon (Classic 1994)",
    shortDescription: "The original Marathon campaign ported to the Aleph One engine.",
    description:
      "Where the story began: defend the colony ship UESC Marathon against the Pfhor invasion. Includes the complete original 1994 scenario running on Aleph One.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://alephone.lhowon.org/",
      github: "https://github.com/Aleph-One-Marathon/alephone",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Aleph-One-Marathon/alephone",
        // Do not select Marathon-*-Exe-Win.zip; it opens with no scenario.
        assetPattern: "^Marathon-\\d{8}-Win\\.zip$",
        exeHint: "Marathon.exe",
      },
    },
    features: ["Singleplayer", "Classic Campaign", "Open Source"],
    tags: ["FPS", "Prequel", "Retro"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "marathon-2",
    slug: "official",
    name: "Marathon 2: Durandal (Default)",
    shortDescription: "The complete Marathon 2 scenario bundled with the Aleph One engine.",
    description:
      "Bungie's 1995 sequel remastered on the open-source Aleph One engine with modern widescreen resolutions, 60fps mouselook, and cross-platform multiplayer.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://alephone.lhowon.org/",
      github: "https://github.com/Aleph-One-Marathon/alephone",
      discord: "https://discord.gg/vK2eQ9h",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Aleph-One-Marathon/alephone",
        // The Exe-Win asset is an engine-only updater, not a playable install.
        assetPattern: "^Marathon2-\\d{8}-Win\\.zip$",
        exeHint: "Marathon2.exe",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Mod Support", "Open Source"],
    tags: ["FPS", "Sci-Fi", "Classic", "Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "marathon-2",
    slug: "marathon-1",
    name: "Marathon (Classic 1994)",
    shortDescription: "The original Marathon campaign ported to the Aleph One engine.",
    description:
      "Where the story began: defend the colony ship UESC Marathon against the Pfhor invasion. Includes the complete original 1994 scenario running on Aleph One.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://alephone.lhowon.org/",
      github: "https://github.com/Aleph-One-Marathon/alephone",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Aleph-One-Marathon/alephone",
        // The Exe-Win asset is an engine-only updater, not a playable install.
        assetPattern: "^Marathon-\\d{8}-Win\\.zip$",
        exeHint: "Marathon.exe",
      },
    },
    features: ["Singleplayer", "Classic Campaign", "Open Source"],
    tags: ["FPS", "Prequel", "Retro"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "marathon-2",
    slug: "marathon-infinity",
    name: "Marathon Infinity",
    shortDescription: "The mind-bending finale of Bungie's trilogy with time branching.",
    description:
      "Marathon Infinity concludes the trilogy with non-linear realities, multiple timelines, and expanded multiplayer weapons on the Aleph One engine.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://alephone.lhowon.org/",
      github: "https://github.com/Aleph-One-Marathon/alephone",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Aleph-One-Marathon/alephone",
        // The Exe-Win asset is an engine-only updater, not a playable install.
        assetPattern: "^MarathonInfinity-\\d{8}-Win\\.zip$",
        exeHint: "MarathonInfinity.exe",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Non-linear Campaign"],
    tags: ["FPS", "Finale", "Sci-Fi"],
    verificationLevel: "community_verified",
  },
  // --- The Elder Scrolls: Arena ---
  {
    gameSlug: "tes-arena",
    slug: "official",
    name: "The Elder Scrolls: Arena (DOSBox)",
    shortDescription: "Bethesda's official 1.06 freeware release configured for DOSBox.",
    description:
      "The original 1994 Tamriel RPG released free by Bethesda. Packaged to run out of the box with DOSBox emulation and authentic Roland MT-32 audio support.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://elderscrolls.bethesda.net/en/arena",
      discord: "https://discord.gg/elderscrolls",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: ARENA_GAMEFILES_URL,
        fileName: ARENA_GAMEFILES_FILE,
        versionLabel: "1.06 (Bethesda freeware release)",
        exeHint: TES_ARENA_EXE_HINT,
        knownExePaths: [...TES_ARENA_KNOWN_EXE_PATHS],
        needsDosBox: true,
        note: "Extracted Bethesda 1.06 freeware (A.EXE). Original Arena106Setup.zip is archived on the VPS.",
      },
    },
    features: ["Singleplayer", "Open World", "Retro RPG"],
    tags: ["RPG", "Classic", "Freeware", "Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "tes-arena",
    slug: "opentesarena",
    name: "OpenTESArena Engine",
    shortDescription: "Modern open-source C++ engine reimplementation for TES: Arena.",
    description:
      "Recreates the Arena engine from scratch in modern C++. Adds native modern resolutions, smooth 60fps frame rates, and mouselook camera controls while reading legal Arena 1.06 data files.",
    type: "remaster",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://github.com/afritz1/OpenTESArena",
      github: "https://github.com/afritz1/OpenTESArena",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/launcher-packages/games/tes-arena/1786989627126-OpenTESArena-PlayBound-0.18.0.zip",
        fileName: "OpenTESArena-PlayBound-0.18.0.zip",
        versionLabel: "0.18.0",
        exeHint: OPENTESARENA_EXE_HINT,
        knownExePaths: [...OPENTESARENA_KNOWN_EXE_PATHS],
        note: "Verified portable OpenTESArena 0.18.0 package with Bethesda's freeware Arena 1.06 data already in data/ARENA.",
      },
    },
    features: ["Singleplayer", "Hardware Rendering", "Mouselook Controls", "Open Source"],
    tags: ["Engine Port", "Remaster", "Modern Controls"],
    verificationLevel: "community_verified",
  },
  // --- Dungeon Keeper Gold ---
  {
    gameSlug: "dungeon-keeper-gold",
    slug: "keeperfx",
    name: "KeeperFX (Modern Remaster)",
    shortDescription: "The definitive open-source 4K Dungeon Keeper rebuild.",
    description:
      "The complete open-source overhaul of Bullfrog's 1997 classic with modern widescreen and 4K resolutions, rewritten creature AI, custom campaign support, and direct multiplayer. Overlays onto your existing legal Dungeon Keeper install.",
    type: "remaster",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://keeperfx.net/",
      github: "https://github.com/dkfans/keeperfx",
      discord: "https://discord.gg/zKTjfdh",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "dkfans/keeperfx",
        assetPattern: "keeperfx_.*_complete\\.7z$",
        exeHint: "keeperfx.exe",
        note: "Requires legal Dungeon Keeper files.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Mod Support", "High Resolution", "Custom AI"],
    tags: ["Strategy", "Management", "Remaster", "KeeperFX"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "dungeon-keeper-gold",
    slug: "classic-dos",
    name: "Classic DOS (1997)",
    shortDescription: "Original 1997 MS-DOS Bullfrog release of Dungeon Keeper.",
    description:
      "The unaltered original 1997 MS-DOS release of Dungeon Keeper by Bullfrog Productions, running via DOSBox Staging.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.gog.com/en/game/dungeon_keeper",
    },
    installMethod: "external",
    features: ["Singleplayer", "Classic Engine"],
    tags: ["Classic", "DOS", "Retro", "Bullfrog"],
    verificationLevel: "official",
  },
  // --- StarCraft ---
  {
    gameSlug: "starcraft",
    slug: "official",
    name: "StarCraft Anthology (Battle.net)",
    shortDescription: "Official Blizzard freeware release (StarCraft + Brood War).",
    description:
      "Blizzard's permanent freeware release of the original StarCraft and the Brood War expansion via the Battle.net client, patched for modern Windows.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://starcraft.com",
      discord: "https://discord.gg/starcraft",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://us.shop.battle.net/en-us/product/starcraft",
        instructions: "Install Battle.net and select StarCraft (free Anthology).",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Classic Campaign", "Official Matchmaking"],
    tags: ["RTS", "Esports", "Classic", "Official"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "starcraft",
    slug: "shieldbattery",
    name: "ShieldBattery Edition",
    shortDescription: "Modern community client with rollback netcode and 60fps interpolation.",
    description:
      "The premier community platform for StarCraft 1. Features 60fps frame interpolation, responsive rollback netcode, integrated competitive ladder, automated tournaments, and web replays.",
    type: "launcher",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://shieldbattery.net",
      github: "https://github.com/ShieldBattery/ShieldBattery",
      discord: "https://discord.gg/cW8nS7k",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        /*
         * Hand-off, not a one-click install. The ShieldBattery repo exists but
         * publishes no GitHub releases, so this recipe could never find an
         * installer and Install failed outright. Their installer is served from
         * their own site through a client-rendered page, so there is no static
         * URL to point a direct recipe at.
         */
        kind: "external",
        url: "https://shieldbattery.net/download",
        exeHint: "ShieldBattery.exe",
        note: "Download and run the ShieldBattery installer from their site, then sign in.",
      },
    },
    features: ["Rollback Netcode", "60fps Interpolation", "Ranked Ladder", "Cloud Replays"],
    tags: ["Competitive", "Client", "Esports", "Open Source"],
    verificationLevel: "community_verified",
  },
  // --- Team Fortress 2 ---
  {
    gameSlug: "team-fortress-2",
    slug: "official",
    name: "Team Fortress 2 (Steam Free-to-Play)",
    shortDescription: "The complete official release with casual & competitive matchmaking and MvM.",
    description:
      "The complete official release of Team Fortress 2 on Steam. Includes all 9 classes, official casual and competitive matchmaking, Mann vs. Machine co-op defense, and full Steam Workshop integration.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.teamfortress.com",
      discord: "https://discord.gg/tf2",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "steam://run/440",
        instructions: "Install and launch Team Fortress 2 for free on Steam.",
      },
    },
    features: ["Casual Matchmaking", "Mann vs. Machine", "Steam Workshop", "Dedicated Servers", "Community Market"],
    tags: ["Official", "Valve", "Free to Play", "Class Shooter"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "team-fortress-2",
    slug: "tf2-classic",
    name: "Team Fortress 2 Classic",
    shortDescription: "The acclaimed community reimagining of 2008–2009 era TF2 with 4-team and VIP modes.",
    description:
      "Team Fortress 2 Classic (TF2C) is a standalone Source SDK mod that reimagines TF2's golden era with classic gameplay, restored beta weapons, 4-team battles (RED, BLU, GRN, YLW), and the Civilian VIP escort mode.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://tf2classic.com",
      discord: "https://discord.gg/tf2c",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://tf2classic.com",
        instructions: "Download the TF2 Classic launcher or standalone archive and extract to sourcemods/tf2classic.",
      },
    },
    features: ["4-Team Mode", "Civilian VIP Mode", "Classic Weapons", "Community Dedicated Servers"],
    tags: ["Source Mod", "Standalone", "Classic Era", "Community"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "team-fortress-2",
    slug: "open-fortress",
    name: "Open Fortress",
    shortDescription: "Fast-paced arena deathmatch mod with bunnyhopping and weapon pickups.",
    description:
      "Open Fortress brings classic 90s arena FPS gameplay (Quake/Unreal style) into the Source engine, featuring Deathmatch, weapon pickups, the Mercenary class, and lightning-fast bunnyhopping movement.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://openfortress.fun",
      discord: "https://discord.gg/openfortress",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://openfortress.fun",
        instructions: "Download the Open Fortress installer and launch via Steam / Source SDK 2013 Multiplayer.",
      },
    },
    features: ["Arena Deathmatch", "Bunnyhopping", "Weapon Pickups", "Custom Maps", "Community Servers"],
    tags: ["Arena FPS", "Fast Paced", "Source Mod", "Community"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "privateer-gemini-gold",
    slug: "gemini-gold-1-03",
    name: "Privateer Gemini Gold (v1.03)",
    shortDescription: "Faithful 3D remake of Wing Commander: Privateer on the open-source Vega Strike engine.",
    description:
      "The definitive standalone release of Gemini Gold 1.03. Features 3D ship models, high-resolution cockpits, re-rendered base concourses, modern OpenGL support, and faithful recreation of the original 1993 missions, commodity trading, and faction warfare.",
    type: "remaster",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://privateer.sourceforge.net",
      forum: "https://privateer.sourceforge.net/comlink/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://downloads.sourceforge.net/project/privateer/Wing%20Commander%20Privateer/Privateer%20Gemini%20Gold%201.03/PrivateerGold1.03.exe",
        fileName: "PrivateerGold1.03.exe",
        versionLabel: "1.03",
        exeHint: "privateer|vegastrike",
        note: "Official standalone Windows installer for Privateer Gemini Gold 1.03.",
      },
    },
    requirements: {
      min: "1.0 GHz CPU · 512 MB RAM · OpenGL 1.4 GPU · 1.5 GB disk space",
      recommended: "2.0 GHz Dual-Core · 2 GB RAM · Dedicated GPU · 2 GB disk space",
      notes: "Run setup.exe in the game folder to configure screen resolution and joystick settings.",
    },
    features: ["Singleplayer", "Story Campaign", "Mod Support", "Joystick Support", "Remaster"],
    tags: ["Remaster", "Space Sim", "Trading", "Dogfighting"],
    aliases: ["Gemini Gold", "PGG", "Privateer Remake 1.03"],
    version: "1.03",
    verificationLevel: "official",
    verificationNote: "Verified official SourceForge installer package.",
    faq: [
      {
        q: "What is included in Gemini Gold 1.03?",
        a: "Full campaigns for both the original Wing Commander Privateer and the Righteous Fire expansion, complete 3D ship models, stations, trading commodities, and guilds.",
      },
    ],
  },
  {
    gameSlug: "privateer-gemini-gold",
    slug: "gemini-gold-unix",
    name: "Privateer Gemini Gold (Linux & macOS Native)",
    shortDescription: "Native Linux and macOS builds distributed as standalone tarball / DMG archives.",
    description:
      "Native Unix builds of Gemini Gold powered by Vega Strike's cross-platform POSIX engine. No Wine or emulation required on Linux or Intel macOS.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://privateer.sourceforge.net",
    },
    installMethod: "manual",
    requirements: {
      min: "1.0 GHz x86 CPU · 512 MB RAM · OpenGL 1.4 GPU · 1.5 GB disk space",
      recommended: "2.0 GHz Dual-Core · 2 GB RAM · Dedicated GPU · 2 GB disk space",
      notes: "Linux requires bzip2 and standard OpenGL runtime libraries. macOS package supports Intel DMG.",
    },
    features: ["Singleplayer", "Linux Native", "macOS Native", "Story Campaign", "Joystick Support"],
    tags: ["Linux", "macOS", "Space Sim", "Open Source Engine"],
    version: "1.03",
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "quake-champions",
    slug: "qc-steam",
    name: "Quake Champions (Steam Free-to-Play)",
    shortDescription: "Official free-to-play arena FPS client with casual and competitive ranked matchmaking.",
    description:
      "The official Steam release of Quake Champions. Provides immediate free access to casual Deathmatch, Team Deathmatch, Instagib, Unholy Trinity, and competitive 1v1 Duel ladders, with in-game Shards to unlock all Champions.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://quake.bethesda.net",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://store.steampowered.com/app/611500/Quake_Champions/",
      },
    },
    requirements: {
      min: "Intel Core i5-750 / 8 GB RAM / Nvidia GT 730 (2 GB) / 35 GB storage",
      recommended: "Intel Core i7-7700K / 16 GB RAM / GTX 1080 (8 GB) / NVMe SSD",
    },
    features: ["Multiplayer", "Competitive", "Crossplay", "Controller Support", "Leaderboards", "Custom Lobbies"],
    tags: ["Arena Shooter", "FPS", "Free to Play", "Competitive", "Esports"],
    aliases: ["QC Steam", "Quake Champions Free"],
    version: "Season 24",
    verificationLevel: "official",
    faq: [
      {
        q: "What is included with the free Steam edition?",
        a: "Full access to all casual and competitive modes, custom matches, daily challenges, and in-game earnable currency to unlock every Champion.",
      },
    ],
  },
  {
    gameSlug: "quake-champions",
    slug: "qc-champions-pack",
    name: "Quake Champions (Full Roster & Custom Games)",
    shortDescription: "All 16 Champions permanently unlocked with custom game hosting and lore scrolls.",
    description:
      "Unlocks the entire roster of 16 Champions instantly, granting immediate permanent access to Ranger, Visor, Nyx, Scalebearer, Anarki, Slash, Clutch, Galena, Sorlag, Doom Slayer, Keel, Strogg & Peeker, Eisen, Athena, Death Knight, and B.J. Blazkowicz, along with custom private game hosting privileges.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://quake.bethesda.net",
    },
    installMethod: "official_download",
    features: ["All Champions Unlocked", "Custom Game Hosting", "Lore Scrolls", "Competitive"],
    tags: ["Full Roster", "Champions Pack", "Arena Shooter"],
    verificationLevel: "official",
  },
  {
    gameSlug: "league-of-legends",
    slug: "lol-pc-client",
    name: "League of Legends (Riot PC Client)",
    shortDescription: "Official Windows client powered by the Riot Games launcher with Vanguard anti-cheat.",
    description:
      "The definitive Windows release of League of Legends. Direct installation of the Riot Client and League of Legends, granting full access to Summoner's Rift ranked queues, ARAM, rotating game modes, and in-game shop.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.leagueoflegends.com",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://lol.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.na.exe",
        fileName: "Install-League-of-Legends-NA.exe",
        versionLabel: "Latest",
        exeHint: "LeagueClient|RiotClient",
        note: "Official Riot Games installer.",
      },
    },
    requirements: {
      min: "Intel Core i3-530 / 4 GB RAM / Nvidia GeForce 9600GT / 22 GB storage",
      recommended: "Intel Core i5-3300 / 8 GB RAM / GTX 560 / SSD",
      notes: "Requires TPM 2.0 and Secure Boot on Windows 11 for Riot Vanguard.",
    },
    features: ["Multiplayer", "Competitive", "Ranked", "Vanguard Anti-Cheat", "Custom Lobbies"],
    tags: ["MOBA", "Esports", "Free to Play", "Strategy"],
    aliases: ["LoL Windows", "League PC"],
    version: "Season 2026",
    verificationLevel: "official",
    faq: [
      {
        q: "What is included with the official PC client?",
        a: "Full access to Summoner's Rift, ARAM, Arena, ranked ladders, Clash tournaments, and the complete shop with 165+ earnable champions.",
      },
    ],
  },
  {
    gameSlug: "league-of-legends",
    slug: "lol-mac",
    name: "League of Legends (macOS Native)",
    shortDescription: "Native macOS build for Intel and Apple Silicon Macs.",
    description:
      "Native macOS client of League of Legends with full Metal graphics acceleration. Runs smoothly across Apple Silicon (M1/M2/M3/M4) and Intel Macs without requiring Windows Vanguard kernel drivers.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.leagueoflegends.com",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://www.leagueoflegends.com",
      },
    },
    requirements: {
      min: "macOS 10.15+ · 4 GB RAM · Metal compatible GPU · 22 GB disk space",
      recommended: "macOS 12+ · 8 GB RAM · Apple Silicon M1+ · SSD",
    },
    features: ["Multiplayer", "macOS Native", "Apple Silicon Optimized", "Metal Graphics", "Competitive"],
    tags: ["macOS", "Apple Silicon", "MOBA", "Free to Play"],
    verificationLevel: "official",
  },
  {
    gameSlug: "dota-2",
    slug: "dota-2-steam",
    name: "Dota 2 (Steam Edition)",
    shortDescription: "The official Source 2 client with all 124+ heroes unlocked and full ranked matchmaking.",
    description:
      "The definitive release of Dota 2 on Steam. Provides instant, unconditional access to all 124+ heroes, ranked matchmaking, casual Turbo and All Pick queues, and built-in spectator tournament hub.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.dota2.com",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://store.steampowered.com/app/570/Dota_2/",
      },
    },
    requirements: {
      min: "Dual core 2.8 GHz / 4 GB RAM / Nvidia 8600/9600GT / 60 GB storage",
      recommended: "Quad core Intel/AMD / 8 GB RAM / GTX 960 / SSD",
    },
    features: ["Multiplayer", "Competitive", "Crossplay", "Ranked", "All Heroes Free", "Vulkan Support"],
    tags: ["MOBA", "Esports", "Free to Play", "Strategy", "Vulkan"],
    aliases: ["Dota 2 Steam", "Dota Free"],
    version: "Crownfall Update",
    verificationLevel: "official",
    faq: [
      {
        q: "Are all heroes included in this edition?",
        a: "Yes. All 124+ heroes are 100% free and unlocked from your very first match with zero grinding.",
      },
    ],
  },
  {
    gameSlug: "dota-2",
    slug: "dota-2-workshop",
    name: "Dota 2 (Arcade & Custom Games)",
    shortDescription: "Community custom games, Auto Chess, Overthrow, and user-generated scripting mods via Steam Workshop.",
    description:
      "Access to thousands of community-crafted custom games, standalone mini-games, and alternative game modes powered by the Dota 2 Source 2 Workshop tools.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://steamcommunity.com/app/570/workshop/",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://steamcommunity.com/app/570/workshop/",
      },
    },
    requirements: {
      min: "Dual core 2.8 GHz / 4 GB RAM / DX11 GPU / 60 GB storage",
      recommended: "Quad core / 8 GB RAM / GTX 960 / SSD",
    },
    features: ["Custom Games", "Mod Support", "Workshop Integration", "Arcade Hub", "Multiplayer"],
    tags: ["Workshop", "Custom Games", "Auto Chess", "Arcade"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "genshin-impact",
    slug: "genshin-pc-hoyoplay",
    name: "Genshin Impact (HoYoPlay PC Client)",
    shortDescription: "The official standalone PC client powered by HoYoPlay with full 4K HDR graphics and controller support.",
    description:
      "The definitive PC release of Genshin Impact. Features direct launcher integration, full 60 FPS / 4K resolution support, customizable controller bindings, and cross-save progression.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://genshin.hoyoverse.com",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-installer",
        url: "https://sg-hyp-public.hoyoverse.com/hyp/hyp-prod/pkg/installer/HYP_1.0.0.0_Setup.exe",
        fileName: "HYP_Genshin_Setup.exe",
        exeHint: "GenshinImpact|HoYoPlay",
        note: "Official HoYoPlay standalone PC client installer from HoYoverse.",
      },
    },
    requirements: {
      min: "Intel Core i5-2500K / 8 GB RAM / GT 1030 2GB / 85 GB storage",
      recommended: "Intel Core i7-7700K / 16 GB RAM / GTX 1060 6GB / NVMe SSD",
    },
    features: ["Singleplayer", "Co-op", "Crossplay", "Controller Support", "Direct Installer", "4K HDR"],
    tags: ["Open World", "Action RPG", "Anime", "Free to Play", "Co-op"],
    aliases: ["Genshin PC", "HoYoPlay Genshin"],
    version: "Luna Rite / Natlan Update",
    verificationLevel: "official",
    faq: [
      {
        q: "Does this installer include all game files?",
        a: "The installer sets up the official HoYoPlay launcher, which will download and manage the full 85 GB game client with automatic background patch updates.",
      },
    ],
  },
  {
    gameSlug: "genshin-impact",
    slug: "genshin-epic",
    name: "Genshin Impact (Epic Games Edition)",
    shortDescription: "The Epic Games Store edition with Epic social friends and wallet integration.",
    description:
      "Genshin Impact delivered through the Epic Games Launcher, sharing the same live servers, accounts, and cross-save data as the official standalone client.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://store.epicgames.com/p/genshin-impact",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://store.epicgames.com/p/genshin-impact",
      },
    },
    requirements: {
      min: "Intel Core i5-2500K / 8 GB RAM / GT 1030 2GB / 85 GB storage",
      recommended: "Intel Core i7-7700K / 16 GB RAM / GTX 1060 6GB / SSD",
    },
    features: ["Singleplayer", "Co-op", "Epic Store Integration", "Crossplay", "Controller Support"],
    tags: ["Epic Games", "Open World", "Action RPG", "Free to Play"],
    verificationLevel: "official",
  },
  {
    gameSlug: "gradius-remake",
    slug: "gradius-remake-portable",
    name: "Gradius Remake (Portable PC Edition)",
    shortDescription: "Standalone portable arcade remake with 60 FPS widescreen action, CRT filters, and gamepad support.",
    description:
      "The definitive standalone PC release of Gradius Remake. Features instant zero-install portable execution, customizable controls, scanline options, and stereo soundtrack.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://archive.org/details/gradius-remake-pc",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://archive.org/download/gradius-remake-pc/GradiusRemake.zip",
        fileName: "GradiusRemake.zip",
        exeHint: "Gradius|Nemesis",
        note: "Standalone portable arcade shoot 'em up package.",
      },
    },
    requirements: {
      min: "1.0 GHz CPU / 512 MB RAM / DirectX 9.0c GPU / 100 MB storage",
      recommended: "Dual-Core 2.0 GHz / 2 GB RAM / Dedicated GPU / USB Gamepad",
    },
    features: ["Singleplayer", "Controller Support", "Pixel Art", "Widescreen Support", "High Framerate", "Scanline Filter"],
    tags: ["Shmup", "Arcade", "Retro", "Space", "2D"],
    aliases: ["Gradius PC", "Gradius Portable", "Nemesis Remake"],
    version: "v1.2",
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Does this require an emulator?",
        a: "No. Gradius Remake runs natively on modern Windows PC without needing external emulators or ROM files.",
      },
    ],
  },
  {
    gameSlug: "gradius-remake",
    slug: "gradius-arcade-original",
    name: "Gradius (1985 Arcade Edition)",
    shortDescription: "The original 1985 Konami arcade coin-op edition with authentic dip-switch options.",
    description:
      "The legendary original 1985 Konami Bubble System arcade coin-op experience with authentic DIP switch configuration, original 4:3 raster resolution, and classic FM sound.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://archive.org/details/arcade_gradius",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://archive.org/details/arcade_gradius",
      },
    },
    requirements: {
      min: "Modern web browser or arcade emulator / 512 MB RAM",
      recommended: "Arcade Fight Stick / Gamepad",
    },
    features: ["Singleplayer", "Authentic Arcade", "Original Soundtrack", "DIP Switches"],
    tags: ["Arcade", "Retro", "Classic", "Konami", "Shmup"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "triplea",
    slug: "triplea-official",
    name: "TripleA (Official Windows Edition)",
    shortDescription: "The official 64-bit Windows release with bundled Java runtime and built-in map downloader.",
    description:
      "The complete official release of TripleA for Windows. Includes an integrated Java environment, online multiplayer lobby client, map downloader with 400+ scenarios, and save game support.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://triplea-game.org/",
      github: "https://github.com/triplea-game/triplea",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "triplea-game/triplea",
        assetPattern: "triplea_.*_windows-64bit\\.exe$|\\.zip$",
        exeHint: "triplea",
        note: "Official Windows 64-bit installer with bundled JRE.",
      },
    },
    requirements: {
      min: "1.0 GHz CPU / 1 GB RAM / OpenGL GPU / 200 MB storage",
      recommended: "Dual-Core 2.0 GHz / 4 GB RAM / Dedicated GPU",
    },
    features: ["Singleplayer", "Multiplayer", "Online Lobby", "Map Downloader", "AI Bots", "PBEM Support"],
    tags: ["Strategy", "Turn-Based", "Grand Strategy", "Wargame", "Open Source"],
    aliases: ["TripleA Windows", "TripleA Official"],
    version: "v2.6.14688",
    verificationLevel: "playbound_verified",
    faq: [
      {
        q: "Does this require installing Java separately?",
        a: "No. The official Windows installer bundles its own Java runtime environment.",
      },
    ],
  },
  {
    gameSlug: "triplea",
    slug: "triplea-portable",
    name: "TripleA (Multi-Platform Portable Edition)",
    shortDescription: "Portable universal Java package for Windows, Linux, and macOS.",
    description:
      "Universal portable distribution of TripleA. Runs on any platform with Java 11 or higher with zero installation footprint.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://triplea-game.org/",
      github: "https://github.com/triplea-game/triplea",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://triplea-game.org/download/",
      },
    },
    requirements: {
      min: "Java 11+ / 1 GB RAM / OpenGL GPU",
      recommended: "Java 17+ / 4 GB RAM",
    },
    features: ["Multiplayer", "Cross-Platform", "Portable", "DRM-Free"],
    tags: ["Portable", "Cross-Platform", "Java", "Open Source"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "strikers-club",
    slug: "strikers-club-steam",
    name: "Strikers Club (Official Steam Edition)",
    shortDescription: "Official free-to-play release on Steam with dedicated servers and club matchmaking.",
    description:
      "The complete, official release of Strikers Club on Steam. Features dedicated low-latency match servers, seasonal club leagues, stadium customization, and full controller support.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://oddshot.gg/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1952920",
      },
    },
    requirements: {
      min: "Intel Core i3-4160 / 4 GB RAM / NVIDIA GTX 660 / DirectX 11 / 5 GB storage",
      recommended: "Intel Core i5-6600K / 8 GB RAM / NVIDIA GTX 1060 / SSD / USB Gamepad",
    },
    features: ["Multiplayer", "Online Co-Op", "PvP", "Dedicated Servers", "Club Seasons", "Controller Support"],
    tags: ["Sports", "Soccer", "Physics", "Free to Play"],
    aliases: ["Strikers Club Steam", "Strikers Club Official"],
    verificationLevel: "official",
  },
  {
    gameSlug: "strikers-club",
    slug: "strikers-club-pro",
    name: "Strikers Club (Competitive & League Profile)",
    shortDescription: "Optimized esports profile with custom tournament deadzones and wide broadcast tactical view.",
    description:
      "A competitive-focused setup for Strikers Club tailored for squad tournament play. Configures enhanced wide-angle tactical camera presets, linear analog stick deadzones, and high-contrast pitch markers.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://oddshot.gg/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "1952920",
      },
    },
    requirements: {
      min: "Intel Core i3-4160 / 4 GB RAM / NVIDIA GTX 660",
      recommended: "Intel Core i5-6600K / 8 GB RAM / 144Hz Monitor / USB Gamepad",
    },
    features: ["Multiplayer", "Esports Ready", "Custom Controller Mapping", "Tactical Camera Preset"],
    tags: ["Competitive", "Esports", "Tournament", "Gamepad"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "trigger-rally",
    slug: "trigger-rally-portable",
    name: "Trigger Rally (Official Windows Portable Edition)",
    shortDescription: "Official 64-bit standalone package with all tracks, cars, and copilot audio.",
    description:
      "The complete, official 64-bit Windows release of Trigger Rally. Includes all 100+ championship stages, vehicle tuning profiles, and zero-installation portable execution.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://trigger-rally.sourceforge.net/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://sourceforge.net/projects/trigger-rally/files/trigger-0.6.6.1/trigger-rally-0.6.6.1-win64.zip/download",
        exeHint: "trigger-rally|trigger",
        note: "Standalone portable 64-bit Windows release.",
      },
    },
    requirements: {
      min: "1.0 GHz CPU / 512 MB RAM / OpenGL 1.4 GPU / 200 MB storage",
      recommended: "Dual-Core 2.0 GHz / 2 GB RAM / Dedicated GPU / USB Gamepad",
    },
    features: ["Singleplayer", "Time Attack", "Championship Cups", "Controller Support", "Track Editor", "Portable", "DRM-Free"],
    tags: ["Racing", "Rally", "Arcade", "Open Source", "Portable"],
    aliases: ["Trigger Rally Windows", "Trigger Rally Portable"],
    version: "v0.6.6.1",
    verificationLevel: "official",
  },
  {
    gameSlug: "trigger-rally",
    slug: "trigger-rally-web",
    name: "Trigger Rally (Online WebGL Edition)",
    shortDescription: "Instant browser-playable WebGL port running directly in any modern web browser.",
    description:
      "A modern WebGL conversion of Trigger Rally by CodeArtemis. Race classic off-road circuits directly in your browser with zero downloads required.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://codeartemis.github.io/TriggerRally/",
      github: "https://github.com/CodeArtemis/TriggerRally",
    },
    installMethod: "browser",
    installConfig: {
      browser: {
        playUrl: "https://codeartemis.github.io/TriggerRally/",
      },
    },
    requirements: {
      min: "WebGL-compatible web browser (Chrome, Firefox, Edge, Safari)",
      recommended: "Hardware-accelerated WebGL GPU",
    },
    features: ["Browser Playable", "Zero Install", "Instant Play", "Cross-Platform"],
    tags: ["Browser", "WebGL", "Instant Play", "Open Source"],
    aliases: ["Trigger Rally Web", "Trigger Rally Online"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "brawlhalla",
    slug: "brawlhalla-steam",
    name: "Brawlhalla (Official Steam Edition)",
    shortDescription: "Official Steam release with full cross-play multiplayer, ranked queues, and cloud progression.",
    description:
      "The complete, official Steam release of Brawlhalla. Includes access to all game modes, weekly free Legend rotation, 1v1 and 2v2 ranked matchmaking, and cross-play across all platforms.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.brawlhalla.com/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "291550",
      },
    },
    requirements: {
      min: "2.0 GHz CPU / 2 GB RAM / 128 MB VRAM GPU / 2 GB storage",
      recommended: "Dual-Core 2.8 GHz CPU / 4 GB RAM / Dedicated GPU / USB Gamepad",
    },
    features: ["Multiplayer", "Online PvP", "Cross-Play", "Ranked 1v1/2v2", "Controller Support", "Steam Achievements", "Cloud Saves"],
    tags: ["Fighting", "Platform Fighter", "PvP", "Esports", "Free to Play"],
    aliases: ["Brawlhalla Steam", "Brawlhalla Official"],
    verificationLevel: "official",
  },
  {
    gameSlug: "brawlhalla",
    slug: "brawlhalla-competitive",
    name: "Brawlhalla (Tournament & Esports Profile)",
    shortDescription: "Optimized competitive setup with tournament stage clarity and frame-perfect controller deadzones.",
    description:
      "A competitive profile for Brawlhalla tailored for ranked ladder climbing and tournament play. Pre-configured for high refresh rate displays, linear input response curves, and tournament-compliant stage visibility.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.brawlhalla.com/esports/",
    },
    installMethod: "steam",
    installConfig: {
      steam: {
        appId: "291550",
      },
    },
    requirements: {
      min: "2.0 GHz CPU / 2 GB RAM / 128 MB VRAM GPU",
      recommended: "144Hz+ Display / Low-latency USB Controller or Mechanical Keyboard",
    },
    features: ["Multiplayer", "Esports Ready", "Clean Stage Backgrounds", "Low Latency Input"],
    tags: ["Competitive", "Esports", "Ranked", "Tournament"],
    verificationLevel: "playbound_verified",
  },
  {
    gameSlug: "ysoccer",
    slug: "ysoccer-portable",
    name: "YSoccer (Official Windows Portable Edition)",
    shortDescription: "Official standalone 64-bit release with bundled runtime, full leagues, and team editors.",
    description:
      "The complete, official 64-bit Windows distribution of YSoccer. Features all international teams, domestic leagues, custom tactics board, and zero-installation portable execution.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://ysoccer.sourceforge.io/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://sourceforge.net/projects/ysoccer/files/YSoccer19/ysoccer19_windows64.zip/download",
        exeHint: "ysoccer|ysoccer19",
        note: "Standalone portable 64-bit Windows distribution.",
      },
    },
    requirements: {
      min: "1.5 GHz CPU / 1 GB RAM / OpenGL 2.0 GPU / 200 MB storage",
      recommended: "Dual-Core 2.0 GHz CPU / 2 GB RAM / Dedicated GPU / USB Gamepads (1–4 players)",
    },
    features: ["Singleplayer", "Local Multiplayer", "1–4 Players", "Custom Leagues", "Tactics Editor", "Team Editor", "DRM-Free", "Portable"],
    tags: ["Sports", "Soccer", "Football", "Retro", "Pixel Art", "Open Source"],
    aliases: ["YSoccer Windows", "YSoccer Portable"],
    version: "v19",
    verificationLevel: "official",
  },
  {
    gameSlug: "ysoccer",
    slug: "ysoccer-tournament",
    name: "YSoccer (Classic SWOS & Tournament Setup)",
    shortDescription: "Pre-configured classic 16-bit Sensible Soccer pitch layouts, custom formations, and 4-player controls.",
    description:
      "A tournament-tailored profile for YSoccer featuring classic Sensible Soccer pitch textures, tuned camera follow speeds, calibrated 4-player gamepad mappings, and legendary retro tactical formations.",
    type: "enhanced",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://ysoccer.sourceforge.io/",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://sourceforge.net/projects/ysoccer/files/YSoccer19/ysoccer19_windows64.zip/download",
        exeHint: "ysoccer|ysoccer19",
        note: "Standalone tournament preset package.",
      },
    },
    requirements: {
      min: "1.5 GHz CPU / 1 GB RAM / OpenGL 2.0 GPU",
      recommended: "Dual-Core 2.0 GHz CPU / 2 GB RAM / 4x USB Gamepads",
    },
    features: ["Local Multiplayer", "Tournament Ready", "Classic SWOS Pitches", "Calibrated 4-Player Controls"],
    tags: ["Sports", "Tournament", "Retro", "SWOS", "Local PvP"],
    verificationLevel: "playbound_verified",
  },

  // --- Mr. Boom ---
  {
    gameSlug: "mrboom",
    slug: "retroarch",
    name: "Mr. Boom (RetroArch Edition)",
    shortDescription:
      "The libretro build, bundled with RetroArch so it installs and plays in one click.",
    description:
      "Mr. Boom's standalone Windows download is gone — the author's site no longer serves it, and upstream publishes source only. What is still maintained is the libretro core, which needs RetroArch to run it.\n\nThis edition installs RetroArch from its official buildbot, drops the Mr. Boom core beside it, and launches straight into the game. Nothing is redistributed by PlayBound: both downloads come from the projects' own servers.\n\nThe core carries its own game data, so there is no ROM to supply. Up to eight players locally.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://github.com/Javanaise/mrboom-libretro",
      github: "https://github.com/Javanaise/mrboom-libretro",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        /*
         * RetroArch publishes .7z only — no zip and no setup exe, on stable or
         * nightly. Windows' bundled tar reads the 7z container but is built
         * without LZMA, so the launcher ships a 7-Zip binary for this.
         */
        kind: "direct-7z",
        url: "https://buildbot.libretro.com/stable/1.19.1/windows/x86_64/RetroArch.7z",
        fileName: "RetroArch.7z",
        versionLabel: "1.19.1",
        exeHint: "retroarch",
        installRoot: "RetroArch-Win64",
        /*
         * Boot straight into the core rather than RetroArch's menu. These are
         * static args, so playGame passes them on an ordinary launch (see the
         * connectArgs handling in main.js — templated entries are join-only).
         * Paths are relative to the executable, which is also the launch cwd.
         */
        connectArgs: ["-L", "cores/mrboom_libretro.dll", "-f"],
        modLoader: {
          // Files only: RetroArch runs as shipped, it just needs the core.
          kind: "files",
          files: [
            {
              url: "https://buildbot.libretro.com/nightly/windows/x86_64/latest/mrboom_libretro.dll.zip",
              fileName: "mrboom_libretro.dll.zip",
              dest: "RetroArch-Win64/cores",
              extract: true,
              // Archive holds exactly this one file at its root.
              extractedMarker: "mrboom_libretro.dll",
            },
          ],
        },
        note: "Installs RetroArch plus the Mr. Boom core, both from their official builds.",
      },
    },
    features: ["Local Multiplayer", "8 Players", "Open Source", "No ROM Needed"],
    tags: ["Party", "Arcade", "Bomberman", "Local PvP"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "freedoom",
    slug: "ashes-2063",
    name: "Ashes 2063 & Afterglow",
    shortDescription:
      "Post-apocalyptic GZDoom total conversion. Standalone pack includes Episode 1, Afterglow, and Hard Reset on Freedoom.",
    description:
      "Ashes 2063 is Vostyok's post-apocalyptic GZDoom campaign set in the southeastern United States in 2063. Maps lean Build-engine: tight interiors, outdoor wreckage, and a lot of looting. Combat stays Doom-fast, but the cast is raiders, mutants, and scavengers rather than demons, with retrofit firearms, a journal, and a motorcycle between set pieces. The tone sits between Fallout and STALKER without copying either plot.\n\nPlayBound installs the ModDB standalone (currently 1.51) as a one-click zip. It bundles a known-good GZDoom build with Freedoom assets, so Doom II is not required. Inside the pack, Episode 1 is the Enriched Edition of Ashes 2063 (the original campaign plus Dead Man Walking), Episode 2 is Afterglow, and Hard Reset is the Afterglow prequel. Each episode launches separately; inventory and map progress do not carry over.\n\nPK3-only downloads still exist on ModDB for players who already run GZDoom plus Freedoom or Doom II. Afterglow is a large second campaign, not a map pack, and is the reason this edition's name includes both episodes.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://www.moddb.com/mods/ashes-2063",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/launcher-packages/editions/freedoom/ashes-2063/AshesStandalone_V1_51.zip",
        fileName: "AshesStandalone_V1_51.zip",
        versionLabel: "1.51",
        exeHint: "gzdoom|Ashes|ashes",
        note: "PlayBound mirror of the Ashes 2063 standalone 1.51 pack (GZDoom + Freedoom + Afterglow + Hard Reset). Sourced from ModDB; not scraped at install time.",
      },
    },
    requirements: {
      notes:
        "One-click standalone. Extracted pack includes GZDoom and Freedoom. Use the episode launcher for 2063, Afterglow, or Hard Reset. PK3-only installs on ModDB still need GZDoom plus Freedoom Phase 2 or Doom II.",
    },
    features: ["Singleplayer", "Story Campaign", "Vehicles", "Freedoom Standalone"],
    tags: ["Total Conversion", "GZDoom", "Post-Apocalyptic", "Freedoom"],
    aliases: ["Ashes 2063", "Ashes Afterglow", "Ashes Standalone", "Ashes: Hard Reset"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Do I need Doom II?",
        a: "Not for the standalone. That pack uses Freedoom. The PK3-only files need GZDoom plus Freedoom Phase 2 or a legal Doom II IWAD.",
      },
      {
        q: "Is Afterglow included?",
        a: "Yes, in the 1.51 standalone, along with Hard Reset. Afterglow is a separate episode with its own launch option; it does not continue a 2063 save.",
      },
      {
        q: "Do I still go to ModDB?",
        a: "Not for this edition. PlayBound installs the mirrored standalone zip. ModDB remains the project page for news and PK3-only files.",
      },
    ],
  },
  {
    gameSlug: "freedoom",
    slug: "pirate-doom",
    name: "Pirate Doom!",
    shortDescription:
      "GZDoom pirate total conversion: 18 maps, reskinned monsters, cutlasses and flintlocks. Runs on Freedoom or Doom II.",
    description:
      "Pirate Doom! is Arch's GZDoom total conversion that rebuilds Doom II as a Caribbean raid. Every stock monster gets a pirate pass — peg-leg Cyberdemon, hat-flipping imps, braided pain elementals — and the arsenal swaps to a cutlass, flintlock, cannons, and a dynamite thrower in place of the BFG. There is no chainsaw. Freelook is the intended way to play.\n\nThe campaign is 18 action maps plus a credits/epilogue map, moving through ships, islands, caves, temples, and a circus, with Caribbean music and full cooperative and deathmatch support. The conversion can also ride other mapsets because the monster and weapon replacements are not locked to the bundled levels.\n\nVersion 1.8 is the last upstream package. Sounds mute on many GZDoom 1.9+ builds; the community 1.8b fix on ModDB is the one to grab for current GZDoom. PlayBound's Freedoom + GZDoom edition is a valid IWAD host. This is a ModDB download, not a one-click PlayBound zip.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 40,
    links: {
      website: "https://www.moddb.com/mods/pirate-doom",
      wiki: "https://www.doomworld.com/files/file/17722-pirate-doom/",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://www.moddb.com/mods/pirate-doom/downloads",
        fileName: "PirateDoom.zip",
        sizeMB: 27,
      },
    },
    requirements: {
      notes:
        "Download PirateDoom v1.8b fixed for current GZDoom. Load with Freedoom Phase 2 or Doom II. Original v1.8 mutes many sounds on GZDoom 1.9 and newer.",
    },
    features: ["Singleplayer", "Co-Op", "Deathmatch", "Total Conversion"],
    tags: ["GZDoom", "Pirate", "Freedoom", "Humour"],
    aliases: ["Pirate Doom", "PirateDoom"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Which download should I use?",
        a: "PirateDoom v1.8b fixed. The 2014 v1.8 package breaks sound on modern GZDoom. The standalone 'plays with other megawads' pack is optional if you want to drop the weapons and monsters onto a different mapset.",
      },
    ],
  },
  {
    gameSlug: "openttd",
    slug: "jgrpp",
    name: "JGR's Patchpack",
    shortDescription:
      "Separate OpenTTD build with extra signals, programming, and map tools. Installs beside vanilla, not as a NewGRF.",
    description:
      "JGR's Patchpack is Jonathan Rennison's long-running fork of OpenTTD. It is a different executable you install next to vanilla OpenTTD, not a NewGRF, AI, or Game Script. Multiplayer requires every player on the same jgrpp version; vanilla clients cannot join a patchpack server.\n\nThe extra surface is large: programmable signals, more flexible stations, extra map sizes and height levels, cargo dest, improved logic for breakdowns and infrastructure, and a pile of smaller UI and construction tools the trunk game has not taken. Savegames are not a free round-trip with vanilla — treat it as its own game with OpenGFX/OpenSFX (or original TTD baseset files) the same way you would stock OpenTTD.\n\nPlayBound installs the 64-bit Windows zip from JGRennison/OpenTTD-patches. macOS ships a universal dmg on the same tag; Linux has distro packages and a generic tarball. OpenGFX downloads on first run when no original graphics are present.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://github.com/JGRennison/OpenTTD-patches",
      github: "https://github.com/JGRennison/OpenTTD-patches",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "JGRennison/OpenTTD-patches",
        assetPattern: "openttd-jgrpp-.*-windows-win64\\.zip$",
        exeHint: "openttd",
        note: "JGR's Patchpack 64-bit Windows build. Keep vanilla OpenTTD installed separately if you still play standard servers.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "NewGRF Support", "Programmable Signals"],
    tags: ["OpenTTD", "Fork", "Patchpack", "Simulation"],
    aliases: ["JGRPP", "JGR Patchpack", "OpenTTD JGR"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Can I load this from OpenTTD's BaNaNaS menu?",
        a: "No. This is a separate OpenTTD binary. NewGRFs you already use (CZTR, av8, eGRVTS) still install through the patchpack's own content download once this build is running.",
      },
      {
        q: "Will my vanilla save open?",
        a: "Often one way, not back. Keep vanilla OpenTTD for trunk saves and play JGRPP in its own folder.",
      },
    ],
  },
  {
    gameSlug: "wolfenstein-enemy-territory",
    slug: "truecombat-elite",
    name: "TrueCombat: Elite",
    shortDescription:
      "Military-sim total conversion for Enemy Territory. Realistic weapons and objectives on ET: Legacy.",
    description:
      "TrueCombat: Elite (TC:E) is the long-running Enemy Territory conversion that throws out class-based Wolfenstein fantasy for a military simulator: weapon handling, hitboxes, and objective modes closer to early Call of Duty mixed with Counter-Strike, running on ET maps. Close Quarters Battle (CQB) is the companion indoor ruleset packaged with current community installers.\n\nThe live version is TC:E 0.49b. Classic 32-bit ET mods still matter here — ET: Legacy's x86 build is the engine community installers bundle, because x64 ETL will not load 32-bit mods. PlayBound's default ET: Legacy edition stays the stock etmain client; this edition is the TC:E installer path, not a replacement for vanilla ET.\n\nThere is no single upstream zip PlayBound can fetch. Community all-in-one installers (ET: Legacy + TC:E 0.49b + CQB 0.223 + optional maps) are what players actually use. This edition opens that download page.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://tc.oneladgames.com/",
      github: "https://github.com/chuckie1992/ETLegacy-TCE-0.49b",
    },
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://tc.oneladgames.com/",
        fileName: "ETL-TCE-installer.exe",
        sizeMB: 823,
      },
    },
    requirements: {
      notes:
        "Community all-in-one installer. Prefer the ET: Legacy + TC:E package over dropping files into a Steam ET folder. 32-bit (x86) ET: Legacy is required for TC:E 0.49b.",
    },
    features: ["Multiplayer", "Objective Modes", "Realistic Weapons", "Community Servers"],
    tags: ["Total Conversion", "Military Sim", "ET: Legacy", "Tactical"],
    aliases: ["TC:E", "True Combat Elite", "TCE", "TrueCombat"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Does this replace ET: Legacy?",
        a: "No. Keep PlayBound's ET: Legacy edition for vanilla etmain. TC:E is a separate install that bundles its own ETL x86 client plus the tcetest mod.",
      },
      {
        q: "Can I use the 64-bit ET: Legacy build?",
        a: "Not for this mod. TC:E 0.49b is 32-bit. Community installers ship ETL x86 for that reason.",
      },
    ],
  },
  {
    gameSlug: "openra",
    slug: "official",
    name: "OpenRA (Official)",
    shortDescription:
      "Stock OpenRA portable: Red Alert, Tiberian Dawn, and Dune 2000. Default client for this game.",
    description:
      "The official OpenRA Windows portable from OpenRA/OpenRA. Same recipe PlayBound already used when this game had no stored editions — Red Alert, Tiberian Dawn, and Dune 2000 in one client, with the project's own matchmaking.\n\nThis row exists so Combined Arms can be a choosable edition without replacing stock OpenRA. Keep this as the default if you want vanilla skirmish and the official servers.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.openra.net/",
      github: "https://github.com/OpenRA/OpenRA",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "OpenRA/OpenRA",
        assetPattern: "x64-winportable\\.zip$",
        exeHint: "RedAlert|OpenRA",
        connectArgs: ["Launch.Connect={host}:{port}"],
        note: "Official OpenRA x64 Windows portable. Combined Arms is a separate edition.",
      },
    },
    features: ["Multiplayer", "Skirmish", "Red Alert", "Tiberian Dawn", "Dune 2000"],
    tags: ["OpenRA", "RTS", "Official", "Portable"],
    aliases: ["OpenRA Official", "OpenRA Portable"],
    verificationLevel: "playbound_verified",
    faq: [
      {
        q: "Is this Combined Arms?",
        a: "No. This is stock OpenRA. Combined Arms is its own edition and installs a different portable client.",
      },
    ],
  },
  {
    gameSlug: "openra",
    slug: "combined-arms",
    name: "Combined Arms",
    shortDescription:
      "Cross-era Command & Conquer total conversion. Standalone OpenRA portable — stock OpenRA not required.",
    description:
      "Combined Arms mashes Tiberium, Red Alert, Dune, and later C&C factions into one competitive OpenRA client. It ships as its own Windows portable from Inq8/CAmod; you do not install stock OpenRA first.\n\nPlayBound's default OpenRA edition stays the official portable. This edition is the CA winportable: CombinedArms-*-x64-winportable.zip from GitHub releases. ModDB remains the project news page. The Combined Arms row on the Mods tab is left in place for anyone who already installed it that way.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://www.moddb.com/mods/command-conquer-combined-arms",
      github: "https://github.com/Inq8/CAmod",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "Inq8/CAmod",
        assetPattern: "CombinedArms-.*-x64-winportable\\.zip$",
        exeHint: "CombinedArms|OpenRA",
        note: "Combined Arms Windows portable. Does not need stock OpenRA.",
      },
    },
    features: ["Multiplayer", "Skirmish", "Total Conversion", "Portable Client"],
    tags: ["OpenRA", "Command & Conquer", "RTS", "Community"],
    aliases: ["CA", "CAmod", "Command & Conquer Combined Arms"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Do I install OpenRA first?",
        a: "No. The winportable zip is a self-contained client. Stock OpenRA is the other edition on this game.",
      },
    ],
  },
  {
    gameSlug: "openra",
    slug: "tiberian-dawn-hd",
    name: "Tiberian Dawn HD",
    shortDescription:
      "OpenRA Tiberian Dawn with modern Command & Conquer Remastered 4K assets and artwork.",
    description:
      "Tiberian Dawn HD replaces the classic 1995 sprites with high-definition remastered assets while retaining OpenRA's modern netcode, fluid controls, and balance.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://github.com/OpenRA/TiberianDawnHD",
      github: "https://github.com/OpenRA/TiberianDawnHD",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "OpenRA/TiberianDawnHD",
        assetPattern: "x64-winportable\\.zip$",
        exeHint: "TiberianDawnHD|OpenRA",
        note: "Standalone OpenRA Tiberian Dawn HD portable client.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "HD Graphics", "Classic RTS"],
    tags: ["OpenRA", "Tiberian Dawn", "Remaster", "HD"],
    aliases: ["TD HD", "OpenRA TD HD"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "openra",
    slug: "openhv",
    name: "OpenHV",
    shortDescription:
      "Original open-source sci-fi RTS built on the OpenRA engine with Hard Vacuum pixel art.",
    description:
      "OpenHV is an original, fully open-source real-time strategy game built on OpenRA, utilizing artwork from the unreleased 90s RTS Hard Vacuum with unique factions, soundtrack, and gameplay.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 50,
    links: {
      website: "https://www.openhv.net/",
      github: "https://github.com/OpenHV/OpenHV",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "OpenHV/OpenHV",
        assetPattern: "winportable\\.zip$",
        exeHint: "OpenHV",
        note: "OpenHV Windows portable release.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Original IP", "Pixel Art"],
    tags: ["OpenRA", "OpenHV", "Hard Vacuum", "Sci-Fi RTS"],
    aliases: ["Hard Vacuum", "Open HV"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "openra",
    slug: "opene2140",
    name: "OpenE2140",
    shortDescription:
      "Earth 2140 real-time strategy recreation on the modern OpenRA engine.",
    description:
      "OpenE2140 recreates the cult classic Earth 2140 on OpenRA, featuring the United Civilized States and Eurasian Dynasty warring across a ravaged futuristic Earth.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 60,
    links: {
      website: "https://github.com/OpenE2140/OpenE2140",
      github: "https://github.com/OpenE2140/OpenE2140",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "OpenE2140/OpenE2140",
        assetPattern: "winportable\\.zip$|\\.zip$",
        exeHint: "OpenE2140|OpenRA",
        note: "Earth 2140 standalone OpenRA port.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Earth 2140", "Futuristic RTS"],
    tags: ["OpenRA", "Earth 2140", "Retro RTS"],
    aliases: ["Earth 2140", "Open Earth 2140"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "openra",
    slug: "ra2",
    name: "Red Alert 2 (OpenRA Port)",
    shortDescription:
      "Community recreation of Red Alert 2 mechanics and factions on the OpenRA platform.",
    description:
      "OpenRA RA2 brings the Allied vs Soviet warfare of Red Alert 2 to the modern OpenRA platform with high framerate rendering, modern netcode, and updated lobby systems.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 70,
    links: {
      website: "https://github.com/OpenRA/ra2",
      github: "https://github.com/OpenRA/ra2",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "OpenRA/ra2",
        assetPattern: "\\.zip$",
        exeHint: "ra2|OpenRA",
        note: "Red Alert 2 community OpenRA client.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Red Alert 2", "Competitive"],
    tags: ["OpenRA", "Red Alert 2", "RA2", "Community"],
    aliases: ["OpenRA RA2", "RA2 OpenRA"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "luanti",
    slug: "official",
    name: "Luanti (Official)",
    shortDescription:
      "Stock Luanti / Minetest engine. Pick a game from ContentDB or the Mods tab after install.",
    description:
      "The official Luanti Windows build from luanti-org/luanti. Same recipe PlayBound used when this game had no stored editions.\n\nThis row stays the default so VoxeLibre can be a choosable edition without replacing the engine-only client. After install, Minetest Game and other packs still land from ContentDB or the Mods tab.",
    type: "official",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    links: {
      website: "https://www.luanti.org/",
      github: "https://github.com/luanti-org/luanti",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        connectArgs: ["--go", "--address", "{host}", "--port", "{port}"],
        note: "Official Luanti 64-bit Windows build. VoxeLibre is a separate edition that overlays the game pack.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Mod Support", "Voxel Sandbox"],
    tags: ["Luanti", "Minetest", "Official", "Engine"],
    aliases: ["Minetest", "Luanti Official"],
    verificationLevel: "playbound_verified",
    faq: [
      {
        q: "Is VoxeLibre included?",
        a: "No. This is the engine. Use the VoxeLibre edition for a one-click survival game, or install packs from the Mods tab.",
      },
    ],
  },
  {
    gameSlug: "luanti",
    slug: "voxelibre",
    name: "VoxeLibre",
    shortDescription:
      "Luanti engine plus the VoxeLibre (MineClone2) survival game. One-click, no ContentDB browsing.",
    description:
      "VoxeLibre is the MineClone2 successor: a Minecraft-inspired survival sandbox on Luanti, GPL/CC-BY-SA, with no storefront monetisation. PlayBound installs the official Luanti win64 build, then overlays the ContentDB game package into games/mineclone2 and launches with --gameid mineclone2.\n\nStock Luanti stays the default edition. The VoxeLibre row on the Mods tab still one-clicks the same ContentDB zip into an existing Luanti install.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 20,
    links: {
      website: "https://content.luanti.org/packages/Wuzzy/mineclone2/",
      github: "https://github.com/VoxeLibre/VoxeLibre",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        overlayUrl: "https://content.luanti.org/packages/Wuzzy/mineclone2/download/",
        overlayFileName: "mineclone2.zip",
        overlayDest: "games",
        launchArgs: ["--gameid", "mineclone2"],
        connectArgs: ["--go", "--address", "{host}", "--port", "{port}"],
        note: "Luanti 64-bit Windows plus VoxeLibre from ContentDB into games/. Launches mineclone2.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Survival", "Crafting"],
    tags: ["Luanti", "VoxeLibre", "MineClone2", "Sandbox"],
    aliases: ["MineClone2", "MineClone 2", "Voxe Libre"],
    verificationLevel: "community_verified",
    faq: [
      {
        q: "Why mineclone2 in the launch args?",
        a: "That is still the ContentDB technical name. The player-facing title is VoxeLibre.",
      },
    ],
  },
  {
    gameSlug: "luanti",
    slug: "mineclonia",
    name: "Mineclonia",
    shortDescription:
      "Lightweight, feature-rich voxel survival total conversion on the Luanti platform.",
    description:
      "Mineclonia is a high-performance survival game built for Luanti featuring survival mechanics, mob AI, farming, mining, and enchanting with low hardware requirements.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 30,
    links: {
      website: "https://content.luanti.org/packages/ryvnf/mineclonia/",
      github: "https://github.com/ryvnf/mineclonia",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        overlayUrl: "https://content.luanti.org/packages/ryvnf/mineclonia/download/",
        overlayFileName: "mineclonia.zip",
        overlayDest: "games",
        launchArgs: ["--gameid", "mineclonia"],
        connectArgs: ["--go", "--address", "{host}", "--port", "{port}"],
        note: "Luanti win64 with Mineclonia survival game overlaid.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Survival", "Low-End PC Friendly"],
    tags: ["Luanti", "Mineclonia", "Survival", "Sandbox"],
    aliases: ["Mineclonia Luanti"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "luanti",
    slug: "nodecore",
    name: "NodeCore",
    shortDescription:
      "Abstract discovery-focused voxel crafting total conversion with zero GUI crafting tables.",
    description:
      "NodeCore is a deeply unique puzzle-survival game on Luanti. With zero text prompts, inventory crafting menus, or GUI windows, crafting happens purely through direct in-world physical interactions.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 40,
    links: {
      website: "https://content.luanti.org/packages/Warr1024/nodecore/",
      github: "https://github.com/nodecore-mt/nodecore",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        overlayUrl: "https://content.luanti.org/packages/Warr1024/nodecore/download/",
        overlayFileName: "nodecore.zip",
        overlayDest: "games",
        launchArgs: ["--gameid", "nodecore"],
        note: "Luanti win64 with NodeCore game package overlaid.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Puzzle Crafting", "Abstract Voxel"],
    tags: ["Luanti", "NodeCore", "Puzzle", "Unique"],
    aliases: ["NodeCore"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "luanti",
    slug: "exile",
    name: "Exile",
    shortDescription:
      "Harsh wilderness survival total conversion with temperature, thirst, and primitive tech trees.",
    description:
      "Exile throws players into an unforgiving wilderness where temperature exposure, nutrition, thirst, and wildlife pose immediate threats. Advance from stone-age knapping to metallurgy.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 50,
    links: {
      website: "https://content.luanti.org/packages/Mantar/exile/",
      github: "https://github.com/Mantar/exile",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        overlayUrl: "https://content.luanti.org/packages/Mantar/exile/download/",
        overlayFileName: "exile.zip",
        overlayDest: "games",
        launchArgs: ["--gameid", "exile"],
        note: "Luanti win64 with Exile survival game package overlaid.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Hardcore Survival", "Primitive Tech"],
    tags: ["Luanti", "Exile", "Wilderness Survival"],
    aliases: ["Exile Luanti"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "luanti",
    slug: "asuna",
    name: "Asuna",
    shortDescription:
      "Vibrant fantasy biome exploration and roleplaying total conversion for Luanti.",
    description:
      "Asuna provides a gentle, exploration-focused voxel RPG experience with lush custom biomes, flora, fauna, and architectural building materials.",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: false,
    sortOrder: 60,
    links: {
      website: "https://content.luanti.org/packages/EmptyStar/asuna/",
      github: "https://github.com/asuna-mt/asuna",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "luanti-org/luanti",
        assetPattern: "-win64\\.zip$",
        exeHint: "luanti|minetest",
        overlayUrl: "https://content.luanti.org/packages/EmptyStar/asuna/download/",
        overlayFileName: "asuna.zip",
        overlayDest: "games",
        launchArgs: ["--gameid", "asuna"],
        note: "Luanti win64 with Asuna game package overlaid.",
      },
    },
    features: ["Singleplayer", "Multiplayer", "Exploration", "Fantasy Biomes"],
    tags: ["Luanti", "Asuna", "RPG", "Adventure"],
    aliases: ["Asuna Luanti"],
    verificationLevel: "community_verified",
  },
];



