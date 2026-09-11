/**
 * The Dark Mod — Windows + Linux native, Mac via Wine Windows package.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 */
export const THE_DARK_MOD_SLUG = "the-dark-mod" as const;

export const theDarkModPlatforms = ["Windows", "macOS", "Linux"] as const;

export const theDarkModFeatures = [
  "Singleplayer",
  "Mod Support",
  "Open Source",
  "Controller Support",
  "Story Campaign",
] as const;

export const theDarkModLauncherInstall = {
  enabled: true,
  kind: "direct-zip" as const,
  url: "https://update.thedarkmod.com/zipsync/tdm_installer.exe.zip",
  urlLinux: "https://update.thedarkmod.com/zipsync/tdm_installer.linux64.zip",
  fileName: "tdm_installer.exe.zip",
  versionLabel: "2.14",
  exeHint: "TheDarkModx64|TheDarkMod|DarkMod|thedarkmod.x64|tdm_installer",
  registryTitles: ["The Dark Mod"],
  knownExePaths: [
    "%GAMES%\\the-dark-mod\\TheDarkModx64.exe",
    "%GAMES%\\the-dark-mod\\TheDarkMod.exe",
    "%PROGRAMFILES%\\TheDarkMod\\TheDarkModx64.exe",
    "%PROGRAMFILES(X86)%\\TheDarkMod\\TheDarkModx64.exe",
    "%PROGRAMFILES%\\The Dark Mod\\TheDarkModx64.exe",
    "%PROGRAMFILES(X86)%\\The Dark Mod\\TheDarkModx64.exe",
    "C:\\Games\\TheDarkMod\\TheDarkModx64.exe",
    "TheDarkModx64.exe",
    "TheDarkMod.exe",
    "DarkMod.exe",
    "thedarkmod.x64",
    "tdm_installer.linux64",
  ],
  note:
    "Official standalone installer package. Windows and Mac (via PlayBound Wine) use the Windows zip; Linux uses the native linux64 installer. No official native Mac build.",
};

export const theDarkModSystemRequirements = {
  min: "Windows 7 / modern Linux · dual-core CPU · 2 GB RAM · OpenGL 3.3 / DX9 GPU · 3 GB storage",
  recommended:
    "Windows 10 / modern Linux · quad-core CPU · 4 GB RAM · dedicated GPU · 4 GB storage",
};

export const theDarkModHardwareRequirements = {
  min: {
    ramMB: 2048,
    storageMB: 3072,
    apis: ["opengl", "dx9"],
    cpuText: "Dual-core CPU",
    gpuText: "OpenGL 3.3 / DirectX 9 capable",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "Windows or Linux native; Mac via Wine/CrossOver/Whisky",
  },
  recommended: {
    ramMB: 4096,
    storageMB: 4096,
    apis: ["opengl", "dx9"],
    cpuText: "Quad-core CPU",
    gpuText: "Dedicated GPU",
    cpuTier: "mid",
    gpuTier: "mid",
    notes: "Windows or Linux native; Mac via Wine/CrossOver/Whisky",
  },
  provenance: {
    source: "playbound_verified",
  },
};

export const theDarkModPatchSource = {
  platforms: [...theDarkModPlatforms],
  features: [...theDarkModFeatures],
  launcherInstall: theDarkModLauncherInstall,
  systemRequirements: theDarkModSystemRequirements,
  hardwareRequirements: theDarkModHardwareRequirements,
};
