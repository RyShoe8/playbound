/**
 * Phase 2 draft editions: Daggerfall Unity remaster, EQ private eras, SWG community.
 * (OpenArena is a standalone Quake-style game — not an Elder Scrolls edition.)
 * Seed script forces coming_soon + unlisted unless overridden here.
 */
import type {
  EditionInstallConfig,
  EditionType,
  EditionStatus,
  EditionVisibility,
  InstallMethod,
  VerificationLevel,
} from "@/lib/editionTypes";

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
    slug: "project-quarm",
    name: "Project Quarm",
    shortDescription: "Community EverQuest era with curated progression.",
    description:
      "Project Quarm is a community EverQuest server project with its own client packaging and progression rules. Install only from Quarm's official site and Discord announcements. Respect Daybreak IP — community editions are third-party.",
    type: "community",
    sortOrder: 20,
    links: {
      website: "https://www.projectquarm.com/",
      discord: "https://discord.gg/projectquarm",
      wiki: "https://wiki.projectquarm.com/",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.projectquarm.com/",
        instructions: "Download the Quarm installer from the official Project Quarm site and follow their setup guide.",
      },
    },
    serverName: "Project Quarm",
    features: ["Multiplayer", "PvE"],
    tags: ["Private Server", "Classic", "EQ"],
    aliases: ["Quarm"],
    verificationLevel: "untested",
    verificationNote: "Community edition — verify files from projectquarm.com only.",
  },
  {
    gameSlug: "everquest",
    slug: "project-99",
    name: "Project 1999",
    shortDescription: "Classic EverQuest recreation circa late 1990s / early Velious.",
    description:
      "Project 1999 recreates classic EverQuest eras. Use their official launcher and wiki. This is an independent community project — not affiliated with Daybreak.",
    type: "community",
    sortOrder: 30,
    links: {
      website: "https://www.project1999.com/",
      wiki: "https://wiki.project1999.com/",
      forum: "https://www.project1999.com/forums/",
    },
    installMethod: "external_installer",
    installConfig: {
      external_installer: {
        url: "https://www.project1999.com/",
        instructions: "Follow Project 1999's official client install instructions on their website.",
      },
    },
    serverName: "Project 1999",
    features: ["Multiplayer", "PvE", "PvP"],
    tags: ["Private Server", "Classic", "EQ"],
    aliases: ["P99", "Project1999"],
    verificationLevel: "untested",
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
