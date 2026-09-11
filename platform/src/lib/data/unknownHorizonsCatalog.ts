/**
 * Unknown Horizons — Windows installer (Wine on Mac/Linux) + hardware.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * The 2019.1 Inno setup installs to C:\Unknown-Horizons and launches via
 * run_uh.bat → bundled python + run_uh.py (there is no unknownhorizons.exe).
 */
export const UNKNOWN_HORIZONS_SLUG = "unknown-horizons" as const;

export const unknownHorizonsPlatforms = ["Windows", "macOS", "Linux"] as const;

export const unknownHorizonsLauncherInstall = {
  enabled: true,
  kind: "direct-installer" as const,
  url: "https://github.com/unknown-horizons/unknown-horizons/releases/download/2019.1/Unknown-Horizons-2019.1.214-Setup-VC15-x86.exe",
  fileName: "Unknown-Horizons-2019.1.214-Setup-VC15-x86.exe",
  versionLabel: "2019.1",
  exeHint: "run_uh",
  registryTitles: ["Unknown Horizons", "Unknown-Horizons"],
  knownExePaths: [
    "C:\\Unknown-Horizons\\unknown-horizons\\run_uh.bat",
    "C:\\Unknown-Horizons\\unknown-horizons\\run_uh.py",
    "%COMPAT_PREFIXES%/unknown-horizons/drive_c/Unknown-Horizons/unknown-horizons/run_uh.bat",
    "run_uh.bat",
    "run_uh.py",
  ],
  note:
    "Official 2019.1 Windows setup (FIFE). PlayBound runs the installer silently; Play starts run_uh via the bundled Python (not a missing .exe).",
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
