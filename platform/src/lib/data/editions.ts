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
        kind: "github-zip",
        repo: "Interkarma/daggerfall-unity",
        assetPattern: "DaggerfallUnity.*Windows.*\\.zip$|dfu_windows.*\\.zip$|\\.zip$",
        exeHint: "DaggerfallUnity",
        note: "Requires original Daggerfall game files.",
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
        postInstallDiscord: "https://discord.gg/projectquarm",
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
    slug: "infinity",
    name: "SWG Infinity",
    shortDescription: "Popular SWGemu community galaxy.",
    description:
      "SWG Infinity is a long-running Star Wars Galaxies emulator server. Download clients and launchers only from Infinity's official site. PlayBound cannot ship Disney/LucasArts client data.",
    type: "community",
    sortOrder: 10,
    isDefault: true,
    links: {
      website: "https://www.swginfinity.com/",
      discord: "https://discord.gg/swginfinity",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swginfinity.com/",
        instructions: "Use the Infinity launcher download from the official SWG Infinity website.",
      },
    },
    serverName: "Infinity",
    features: ["Multiplayer", "Sandbox"],
    tags: ["SWGemu", "Star Wars"],
    aliases: ["Infinity"],
    verificationLevel: "untested",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "legends",
    name: "SWG Legends",
    shortDescription: "NGE-focused Star Wars Galaxies community.",
    description:
      "SWG Legends focuses on the New Game Experience era of Star Wars Galaxies. Get the client from their official download page only.",
    type: "community",
    sortOrder: 20,
    links: {
      website: "https://www.swglegends.com/",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swglegends.com/",
        instructions: "Download the Legends launcher from swglegends.com.",
      },
    },
    serverName: "Legends",
    features: ["Multiplayer"],
    tags: ["SWG", "NGE"],
    aliases: ["Legends"],
    verificationLevel: "untested",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "beyond",
    name: "SWG Beyond",
    shortDescription: "Community SWG server with its own progression.",
    description:
      "SWG Beyond is a community Star Wars Galaxies edition. Always fetch installers from Beyond's official site and read their rules before transferring characters or items.",
    type: "community",
    sortOrder: 30,
    links: {
      website: "https://www.swgbeyond.com/",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swgbeyond.com/",
        instructions: "Use the Beyond client/launcher links posted on the official site.",
      },
    },
    serverName: "Beyond",
    features: ["Multiplayer"],
    tags: ["SWGemu"],
    aliases: ["Beyond"],
    verificationLevel: "untested",
  },
  {
    gameSlug: "star-wars-galaxies",
    slug: "restoration",
    name: "SWG Restoration",
    shortDescription: "Pre-CU / restorational SWG community focus.",
    description:
      "SWG Restoration emphasizes classic Star Wars Galaxies gameplay. Obtain their approved client package from Restoration's official channels only.",
    type: "community",
    sortOrder: 40,
    links: {
      website: "https://www.swgemu.com/",
      wiki: "https://wiki.swgemu.com/",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.swgemu.com/",
        instructions: "Follow SWGEmu / Restoration community install docs for approved clients.",
      },
    },
    serverName: "Restoration",
    features: ["Multiplayer", "Sandbox"],
    tags: ["Pre-CU", "SWGemu"],
    aliases: ["Restoration", "SWGEmu"],
    verificationLevel: "untested",
  },
  {
    gameSlug: "holocure",
    slug: "playbound",
    name: "HoloCure: Multiplayer (Experimental)",
    shortDescription:
      "Community co-op multiplayer for HoloCure, installed in one click. Experimental — expect occasional crashes.",
    description:
      "Adds PippleCultist's community multiplayer mod to your Steam copy of HoloCure — Save the Fans!, so you can play co-op over LAN or with Steam friends. PlayBound installs the Aurie mod loader and the mod itself for you, and re-applies them automatically whenever Steam updates HoloCure and reverts the change.\n\nThis is experimental community software, not an official HoloCure feature. The mod's own author notes it \"will probably be buggy and have random crashes since a lot has been modified in the game to get it working\". Your saves are untouched and you can return to unmodded HoloCure at any time by uninstalling this edition, or through Steam's Verify integrity of game files.\n\nWant the plain game instead? Install the Official Vanilla Edition.",
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
        // HoloCure itself is free on Steam and is not redistributable, so this
        // edition never ships the game — it opens Steam's install for appid
        // 2420510, waits for the executable to appear (knownExePaths first,
        // then the launcher's drive scan, which is what finds libraries on a
        // second drive), and then applies the mod loader below.
        kind: "external",
        url: "https://store.steampowered.com/app/2420510/HoloCure__Save_the_Fans/",
        exeHint: "HoloCure|holocure",
        knownExePaths: [
          "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
          "%PROGRAMFILES%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
          "%LOCALAPPDATA%\\HoloCure\\HoloCure.exe",
        ],
        note: "Installs HoloCure through Steam, then adds the community multiplayer mod automatically.",
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
      "Multiplayer",
      "Co-op",
      "Sandbox",
      "Custom Characters",
      "Verified Mods",
      "PlayBound Edition",
    ],
    aliases: ["HoloCure PlayBound", "HoloCure Multiplayer", "HoloCure Enhanced"],
    verificationLevel: "playbound_verified",
    branding: {
      heroImage: "/games/holocure/editions/playbound.jpg",
      screenshots: [
        "/games/holocure/editions/playbound.jpg",
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
    installMethod: "official_download",
    installConfig: {
      official_download: {
        url: "https://kay-yu.itch.io/holocure",
        fileName: "HoloCure.zip",
        sizeMB: 250,
      },
    },
    features: ["Singleplayer", "Controller Support", "Steam Deck Playable"],
    tags: ["Vanilla", "Official", "Singleplayer"],
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
        assetPattern: "Marathon2-.*-Win\\.zip$",
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
        assetPattern: "Marathon-.*-Win\\.zip$",
        exeHint: "Marathon.exe",
      },
    },
    features: ["Singleplayer", "Classic Campaign", "Open Source"],
    tags: ["FPS", "Prequel", "Retro"],
    verificationLevel: "community_verified",
  },
  {
    gameSlug: "alephone",
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
        assetPattern: "MarathonInfinity-.*-Win\\.zip$",
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
        url: "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/Arena106Setup.zip",
        exeHint: "ARENA.EXE",
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
      website: "https://github.com/aep93/OpenTESArena",
      github: "https://github.com/aep93/OpenTESArena",
    },
    installMethod: "playbound_installer",
    installConfig: {
      playbound_installer: {
        kind: "github-zip",
        repo: "aep93/OpenTESArena",
        assetPattern: ".*\\.zip$",
        exeHint: "OpenTESArena.exe",
        note: "Requires Arena 1.06 data files.",
      },
    },
    features: ["Singleplayer", "Hardware Rendering", "Mouselook Controls", "Open Source"],
    tags: ["Engine Port", "Remaster", "Modern Controls"],
    verificationLevel: "community_verified",
  },
  // --- KeeperFX ---
  {
    gameSlug: "keeperfx",
    slug: "official",
    name: "KeeperFX Complete Edition",
    shortDescription: "The definitive open-source Dungeon Keeper rebuild.",
    description:
      "The complete open-source overhaul of Dungeon Keeper with modern 4K resolutions, rewritten creature AI, custom campaign support, and multiplayer. Overlays onto your existing legal Dungeon Keeper install.",
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
    features: ["Singleplayer", "Multiplayer", "Mod Support", "High Resolution"],
    tags: ["Strategy", "Management", "Remaster", "Official"],
    verificationLevel: "playbound_verified",
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
        instructionNote: "Install Battle.net and select StarCraft (free Anthology).",
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
        kind: "github-installer",
        repo: "ShieldBattery/ShieldBattery",
        assetPattern: ".*\\.exe$",
        exeHint: "ShieldBattery.exe",
      },
    },
    features: ["Rollback Netcode", "60fps Interpolation", "Ranked Ladder", "Cloud Replays"],
    tags: ["Competitive", "Client", "Esports", "Open Source"],
    verificationLevel: "community_verified",
  },
];

