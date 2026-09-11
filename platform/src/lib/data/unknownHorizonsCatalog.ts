/**
 * Unknown Horizons — Windows installer (Wine on Mac/Linux) + hardware.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * The 2019.1 setup drops a real unknownhorizons.exe; do not point Play at run_uh.bat.
 */
export const UNKNOWN_HORIZONS_SLUG = "unknown-horizons" as const;

export const unknownHorizonsPlatforms = ["Windows", "macOS", "Linux"] as const;

export const unknownHorizonsLauncherInstall = {
  enabled: true,
  kind: "direct-installer" as const,
  url: "https://github.com/unknown-horizons/unknown-horizons/releases/download/2019.1/Unknown-Horizons-2019.1.214-Setup-VC15-x86.exe",
  fileName: "Unknown-Horizons-2019.1.214-Setup-VC15-x86.exe",
  versionLabel: "2019.1",
  exeHint: "unknownhorizons",
  registryTitles: ["Unknown Horizons"],
  knownExePaths: [
    "%PROGRAMFILES(X86)%\\Unknown Horizons\\unknownhorizons.exe",
    "%PROGRAMFILES%\\Unknown Horizons\\unknownhorizons.exe",
    "%LOCALAPPDATA%\\Programs\\Unknown Horizons\\unknownhorizons.exe",
    "%COMPAT_PREFIXES%/unknown-horizons/drive_c/Program Files (x86)/Unknown Horizons/unknownhorizons.exe",
    "%COMPAT_PREFIXES%/unknown-horizons/drive_c/Program Files/Unknown Horizons/unknownhorizons.exe",
    "unknownhorizons.exe",
  ],
  note:
    "Official 2019.1 Windows setup (FIFE). Mac and Linux run the same installer through PlayBound Wine — there is no modern native Mac build. Play launches unknownhorizons.exe, not run_uh.bat.",
};

export const unknownHorizonsSystemRequirements = {
  min: "Windows 7 / Wine · dual-core CPU · 2 GB RAM · OpenGL 2.0 GPU · 500 MB storage",
  recommended: "Windows 10 / Wine · quad-core CPU · 4 GB RAM · dedicated GPU · 1 GB storage",
} as const;

export const unknownHorizonsHardwareRequirements = {
  min: {
    ramMB: 2048,
    storageMB: 500,
    apis: ["opengl"],
    cpuText: "Dual-core CPU",
    gpuText: "OpenGL 2.0 capable",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "Windows native; Mac/Linux via Wine/CrossOver/Whisky",
  },
  recommended: {
    ramMB: 4096,
    storageMB: 1024,
    apis: ["opengl"],
    cpuText: "Quad-core CPU",
    gpuText: "Dedicated GPU",
    cpuTier: "mid",
    gpuTier: "mid",
    notes: "Windows native; Mac/Linux via Wine/CrossOver/Whisky",
  },
  provenance: {
    source: "playbound_verified" as const,
  },
};

export const unknownHorizonsPatchSource = {
  platforms: [...unknownHorizonsPlatforms],
  launcherInstall: unknownHorizonsLauncherInstall,
  systemRequirements: unknownHorizonsSystemRequirements,
  hardwareRequirements: unknownHorizonsHardwareRequirements,
};
