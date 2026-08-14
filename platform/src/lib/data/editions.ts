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
    shortDescription: "Community EverQuest era with curated progression.",
    description:
      "Project Quarm is a community EverQuest server that uses the TAKP classic client and login system. PlayBound can install the public TAKP/Quarm v2.2 base client for you, but you still create a TAKP forum + game account and apply the latest Quarm patch from Discord before you can log in.\n\nQuarm is a third-party community project and is not affiliated with Daybreak. Always get patches and rules from official Quarm channels.",
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
        kind: "direct-zip",
        url: "https://sahaquiel.us/quarm/TAKP2.2.zip",
        fileName: "TAKP2.2.zip",
        versionLabel: "takp-2.2",
        exeHint: "eqgame",
        checksumMd5: "002741614acef667b9c70e55a5a766e0",
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
    shortDescription: "Classic EverQuest recreation circa late 1990s / early Velious.",
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
];
