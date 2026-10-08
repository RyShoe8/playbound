/** Reviewed, DB-only edition fields. Applied solely through PATCH_EDITION_FIELDS. */
export const CATALOG_EDITION_CORRECTIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "rimworld/rimworld-together": {
    installConfig: {
      playbound_installer: {
        kind: "locate-then-zip",
        repo: "RimWorld-Together/Rimworld-Together",
        assetPattern: "^3005289691\\.zip$",
        baseExeHint: "RimWorldWin64|RimWorldLinux|RimWorld.app",
        exeHint: "RimWorldWin64|RimWorldLinux|RimWorld.app",
        overlayDest: "Mods/Rimworld-Together",
        requiresBaseDir: true,
      },
    },
  },
};
