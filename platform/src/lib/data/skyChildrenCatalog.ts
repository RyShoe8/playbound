/**
 * Sky: Children of the Light — mobile-store catalog patch (Mongo-only title).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * PlayBound lists the free mobile builds (Google Play / App Store) only.
 */
export const SKY_CHILDREN_SLUG = "sky-children-of-the-light" as const;

export const skyChildrenPlatforms = ["Android", "iOS"] as const;

export const skyChildrenAndroidStoreUrl =
  "https://play.google.com/store/apps/details?id=com.tgc.sky.android";

export const skyChildrenIosStoreUrl =
  "https://apps.apple.com/app/sky-children-of-the-light/id1462117269";

export const skyChildrenLauncherInstall = {
  enabled: false,
  kind: "external" as const,
  url: "https://www.thatgamecompany.com/sky/",
  note: "Sky on PlayBound is the free mobile edition (Google Play and App Store). PC/console builds are not offered here.",
};

export const skyChildrenPatchSource = {
  platforms: [...skyChildrenPlatforms],
  androidStoreUrl: skyChildrenAndroidStoreUrl,
  iosStoreUrl: skyChildrenIosStoreUrl,
  launchMethods: ["install"] as const,
  steamDeck: false,
  steamAppId: null as string | null,
  browserPlayable: false,
  launcherInstall: skyChildrenLauncherInstall,
  website: "https://www.thatgamecompany.com/sky/",
};
