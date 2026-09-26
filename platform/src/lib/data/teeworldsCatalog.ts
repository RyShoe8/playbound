/**
 * Teeworlds — cross-platform install + hardware patch (Mongo-only).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 * Party Connect is already managed-server (adapters.ts) — not patched here.
 */
export const TEEWORLDS_SLUG = "teeworlds" as const;

const teeworldsPlatforms = ["Windows", "macOS", "Linux"] as const;

const teeworldsFeatures = [
  "Multiplayer",
  "LAN Support",
  "Dedicated Servers",
  "Open Source",
  "Controller Support",
] as const;

const teeworldsLauncherInstall = {
  enabled: true,
  kind: "github-installer" as const,
  repo: "teeworlds/teeworlds",
  assetPattern: "teeworlds-.*-win64\\.zip$",
  assetPatternMac: "teeworlds-.*-osx\\.dmg$",
  assetPatternLinux: "teeworlds-.*-linux_x86_64\\.tar\\.gz$",
  exeHint: "teeworlds",
  knownExePaths: [
    "teeworlds.exe",
    "teeworlds",
    "Teeworlds.app",
    "%APPLICATIONS%/Teeworlds.app",
    "%HOME_APPLICATIONS%/Teeworlds.app",
  ],
  versionLabel: "0.7.5",
  unwrapSingleRoot: true,
  note: "Official Teeworlds release — Windows zip, macOS DMG, or Linux x86_64 tarball.",
};

const teeworldsSystemRequirements = {
  min: "Any modern OS · dual-core CPU · 512 MB RAM · OpenGL 2.0 · 50 MB storage",
  recommended: "Any modern OS · dual-core CPU · 1 GB RAM · OpenGL 2.0 · 100 MB storage",
};

const teeworldsHardwareRequirements = {
  min: {
    ramMB: 512,
    storageMB: 50,
    apis: ["opengl"],
    cpuText: "Dual-core CPU",
    gpuText: "OpenGL 2.0 capable",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "2D multiplayer; very light",
  },
  recommended: {
    ramMB: 1024,
    storageMB: 100,
    apis: ["opengl"],
    cpuText: "Dual-core CPU",
    gpuText: "OpenGL 2.0 capable",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "2D multiplayer; very light",
  },
  provenance: {
    source: "playbound_verified",
  },
};

/*
 * The admin "Prefill from URL" import tool's FAQ template assumed Teeworlds
 * is browser-playable ("What platforms does Teeworlds run on? Web.", size
 * answered "About small. The minimum system requirements are Modern web
 * browser.") — it is a native Windows/macOS/Linux download, confirmed
 * unsupported for browser play (browserPlayable: false) via the admin edit
 * page 2026-09-25.
 */
const teeworldsFaq = [
  {
    q: "Is Teeworlds free?",
    a: "Yes. Teeworlds is released under Free to play and costs nothing to download or play.",
  },
  { q: "How big is the Teeworlds download?", a: "About 20 MB." },
  { q: "What platforms does Teeworlds run on?", a: "Windows, macOS, Linux." },
  { q: "Do I need an account to play Teeworlds?", a: "No account is required to download or play." },
];

export const teeworldsPatchSource = {
  developerSlug: "teeworlds-team",
  platforms: [...teeworldsPlatforms],
  features: [...teeworldsFeatures],
  faq: teeworldsFaq,
  launcherInstall: teeworldsLauncherInstall,
  systemRequirements: teeworldsSystemRequirements,
  hardwareRequirements: teeworldsHardwareRequirements,
};
