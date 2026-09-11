/**
 * Slapshot: Rebound — controller, hardware, Steam install patch (Mongo-only).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 */
export const SLAPSHOT_REBOUND_SLUG = "slapshot-rebound" as const;

export const slapshotReboundFeatures = [
  "Singleplayer",
  "Multiplayer",
  "Co-op",
  "Controller Support",
] as const;

export const slapshotReboundLauncherInstall = {
  enabled: true,
  kind: "external" as const,
  url: "steam://run/1173370",
  steamAppId: "1173370",
  versionLabel: "Steam",
  note: "Installs the free official Slapshot: Rebound release through Steam.",
};

export const slapshotReboundSystemRequirements = {
  min: "Windows 10 · Intel Core i5 · 4 GB RAM · GTX 760 / equivalent · DirectX 11 · 2 GB storage",
  recommended:
    "Windows 10 · Intel Core i5 · 8 GB RAM · GTX 1060 / equivalent · DirectX 11 · 2 GB storage",
};

export const slapshotReboundHardwareRequirements = {
  min: {
    ramMB: 4096,
    storageMB: 2048,
    apis: ["dx11"],
    cpuText: "Intel Core i5 or equivalent",
    gpuText: "GTX 760 / equivalent",
    cpuTier: "mid",
    gpuTier: "entry",
    notes: "Windows 10 · DirectX 11",
  },
  recommended: {
    ramMB: 8192,
    storageMB: 2048,
    apis: ["dx11"],
    cpuText: "Intel Core i5 or better",
    gpuText: "GTX 1060 / equivalent",
    cpuTier: "mid",
    gpuTier: "mid",
    notes: "Windows 10 · DirectX 11",
  },
  provenance: {
    source: "playbound_verified",
  },
};

export const slapshotReboundPatchSource = {
  features: [...slapshotReboundFeatures],
  systemRequirements: slapshotReboundSystemRequirements,
  hardwareRequirements: slapshotReboundHardwareRequirements,
  launcherInstall: slapshotReboundLauncherInstall,
};
