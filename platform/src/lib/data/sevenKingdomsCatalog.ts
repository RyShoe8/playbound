/**
 * Seven Kingdoms: Ancient Adversaries — launcherInstall patch.
 * Catalog knownExePaths was empty; install poll could miss 7kaa.exe after NSIS.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 */
export const SEVEN_KINGDOMS_SLUG = "seven-kingdoms-ancient-adversaries" as const;

export const sevenKingdomsLauncherInstall = {
  enabled: true,
  kind: "direct-installer" as const,
  url: "https://sourceforge.net/projects/skfans/files/7KAA%202.15.7/7kaa-install-2.15.7-win32.exe/download",
  fileName: "7kaa-install-2.15.7-win32.exe",
  versionLabel: "2.15.7",
  exeHint: "7kaa",
  knownExePaths: [
    "7kaa.exe",
    "7kaa\\7kaa.exe",
    "Program Files\\7kaa\\7kaa.exe",
    "Program Files (x86)\\7kaa\\7kaa.exe",
  ],
  registryTitles: [
    "7kaa",
    "Seven Kingdoms Ancient Adversaries",
    "Seven Kingdoms: Ancient Adversaries",
  ],
  note: "Official SourceForge Windows installer. PlayBound looks for 7kaa.exe under Program Files after setup finishes.",
};
