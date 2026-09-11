/**
 * Teeworlds — cross-platform install + hardware patch (Mongo-only).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 * Party Connect is already managed-server (adapters.ts) — not patched here.
 */
export const TEEWORLDS_SLUG = "teeworlds" as const;

export const teeworldsPlatforms = ["Windows", "macOS", "Linux"] as const;

export const teeworldsFeatures = [
  "Multiplayer",
  "LAN Support",
  "Open Source",
  "Controller Support",
] as const;

export const teeworldsLauncherInstall = {
  enabled: true,
  kind: "github-installer" as const,
  repo: "teeworlds/teeworlds",
  assetPattern: "teeworlds-.*-win64\\.zip$",
  assetPatternMac: "teeworlds-.*-osx\\.dmg$",
  assetPatternLinux: "teeworlds-.*-linux_x86_64\\.tar\\.gz$",
  exeHint: "teeworlds",
  knownExePaths: ["teeworlds.exe", "teeworlds", "Teeworlds.app"],
  versionLabel: "0.7.5",
  unwrapSingleRoot: true,
  note: "Official Teeworlds release — Windows zip, macOS DMG, or Linux x86_64 tarball.",
};

export const teeworldsSystemRequirements = {
  min: "Any modern OS · dual-core CPU · 512 MB RAM · OpenGL 2.0 · 50 MB storage",
  recommended: "Any modern OS · dual-core CPU · 1 GB RAM · OpenGL 2.0 · 100 MB storage",
};

export const teeworldsHardwareRequirements = {
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

export const teeworldsPatchSource = {
  platforms: [...teeworldsPlatforms],
  features: [...teeworldsFeatures],
  launcherInstall: teeworldsLauncherInstall,
  systemRequirements: teeworldsSystemRequirements,
  hardwareRequirements: teeworldsHardwareRequirements,
};
