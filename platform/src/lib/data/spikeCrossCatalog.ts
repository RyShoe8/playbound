/**
 * The Spike Cross — Steam PC + mobile stores, install steps, hardware.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 */
export const SPIKE_CROSS_SLUG = "the-spike-cross" as const;

const spikeCrossPlatforms = ["Windows", "Android", "iOS"] as const;

const spikeCrossAndroidStoreUrl =
  "https://play.google.com/store/apps/details?id=com.daerisoft.thespikerm";

const spikeCrossIosStoreUrl =
  "https://apps.apple.com/app/the-spike-volleyball-story/id1510097347";

const spikeCrossFeatures = [
  "Multiplayer",
  "Co-Op",
  "Split-Screen Co-op",
  "Controller Support",
] as const;

const spikeCrossLauncherInstall = {
  enabled: true,
  kind: "external" as const,
  url: "steam://install/3983810",
  steamAppId: "3983810",
  versionLabel: "Steam",
  note: "Free on Steam only for PC — no DRM-free Windows build. Mobile installs use Google Play / App Store.",
};

const spikeCrossSystemRequirements = {
  min: "Windows 10 · Dual-Core CPU · 4 GB RAM · DX11 GPU · 1 GB storage",
  recommended: "Windows 10 · Quad-Core · 8 GB RAM · Dedicated GPU · 1 GB storage",
} as const;

const spikeCrossHardwareRequirements = {
  min: {
    ramMB: 4096,
    storageMB: 1024,
    apis: ["dx11"],
    cpuText: "Dual-core CPU",
    gpuText: "DirectX 11 capable",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "Windows via Steam; Android / iOS via store CTAs",
  },
  recommended: {
    ramMB: 8192,
    storageMB: 1024,
    apis: ["dx11"],
    cpuText: "Quad-core CPU",
    gpuText: "Dedicated GPU",
    cpuTier: "mid",
    gpuTier: "mid",
    notes: "Windows via Steam; Android / iOS via store CTAs",
  },
  provenance: {
    source: "playbound_verified" as const,
  },
};

const spikeCrossInstallSteps = [
  {
    platform: "windows" as const,
    text: "Choose Install in PlayBound. Steam opens the free The Spike Cross app (3983810) — sign in if needed and finish Steam's install.",
  },
  {
    platform: "windows" as const,
    text: "When Steam finishes, return to PlayBound and press Play. Controllers are recognized natively for local matches.",
  },
  {
    platform: "android" as const,
    text: "Open the Google Play listing from the game page and install The Spike. Sign in with Google Play Games if prompted.",
  },
  {
    platform: "ios" as const,
    text: "Open the App Store listing from the game page and install The Spike. Sign in with Game Center if prompted.",
  },
];

export const spikeCrossPatchSource = {
  platforms: [...spikeCrossPlatforms],
  androidStoreUrl: spikeCrossAndroidStoreUrl,
  iosStoreUrl: spikeCrossIosStoreUrl,
  features: [...spikeCrossFeatures],
  launcherInstall: spikeCrossLauncherInstall,
  systemRequirements: spikeCrossSystemRequirements,
  hardwareRequirements: spikeCrossHardwareRequirements,
  installSteps: spikeCrossInstallSteps,
};
