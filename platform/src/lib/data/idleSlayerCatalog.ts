/**
 * Idle Slayer — mobile-store catalog patch (Mongo-only title).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * Official PC is Steam-only; PlayBound lists the free mobile builds instead.
 */
export const IDLE_SLAYER_SLUG = "idle-slayer" as const;

export const idleSlayerPlatforms = ["Android", "iOS"] as const;

export const idleSlayerAndroidStoreUrl =
  "https://play.google.com/store/apps/details?id=com.pabloleban.IdleSlayer";

export const idleSlayerIosStoreUrl = "https://apps.apple.com/app/idle-slayer/id1526599527";

/** No PlayBound Launcher / Steam install path — store CTAs only. */
export const idleSlayerLauncherInstall = {
  enabled: false,
  kind: "external" as const,
  url: "https://idleslayer.com/",
  note: "Idle Slayer on PlayBound is the free mobile edition (Google Play and App Store). The Steam PC build is not offered here.",
};

export const idleSlayerPatchSource = {
  platforms: [...idleSlayerPlatforms],
  androidStoreUrl: idleSlayerAndroidStoreUrl,
  iosStoreUrl: idleSlayerIosStoreUrl,
  launchMethods: ["install"] as const,
  steamDeck: false,
  steamAppId: null as string | null,
  browserPlayable: false,
  launcherInstall: idleSlayerLauncherInstall,
  website: "https://idleslayer.com/",
};
