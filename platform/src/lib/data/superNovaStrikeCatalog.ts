/**
 * Super Nova Strike — mobile-store catalog patch source (Mongo-only title).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * PlayBound lists the official free mobile builds (Google Play and Apple App Store).
 */
export const SUPER_NOVA_STRIKE_SLUG = "super-nova-strike" as const;

export const superNovaStrikePlatforms = ["Android", "iOS"] as const;

export const superNovaStrikeAndroidStoreUrl =
  "https://play.google.com/store/apps/details?id=com.BorgMobile.SuperNovaStrike";

export const superNovaStrikeIosStoreUrl =
  "https://apps.apple.com/us/app/super-nova-strike/id6739474148";

export const superNovaStrikeWebsite = "https://tsyborg.com/borgmobile/";

export const superNovaStrikeLauncherInstall = {
  enabled: false,
  kind: "external" as const,
  url: superNovaStrikeWebsite,
  note: "Super Nova Strike is available on mobile devices via Google Play and the Apple App Store.",
};

export const superNovaStrikeSystemRequirements = {
  min: "Android 8.0+ / iOS 13.0+ · Touchscreen mobile device · 100 MB free storage",
  recommended: "Modern smartphone or tablet · Android 11+ / iOS 15+ · 150 MB free storage",
} as const;

export const superNovaStrikeHardwareRequirements = {
  min: {
    ramMB: 2048,
    storageMB: 100,
    apis: ["opengl"] as ("dx9" | "dx10" | "dx11" | "dx12" | "vulkan" | "metal" | "opengl")[],
    cpuText: "Quad-core mobile processor",
    gpuText: "Integrated mobile GPU",
    notes: "Available on Android via Google Play and iOS via Apple App Store.",
  },
  recommended: {
    ramMB: 4096,
    storageMB: 150,
    apis: ["opengl", "metal"] as ("dx9" | "dx10" | "dx11" | "dx12" | "vulkan" | "metal" | "opengl")[],
    cpuText: "Octa-core mobile processor",
    gpuText: "High-performance mobile GPU",
    notes: "Fluid 60 FPS mobile arcade gameplay.",
  },
  provenance: {
    source: "playbound_verified" as const,
    enteredBy: "admin" as const,
  },
};

export const superNovaStrikeEditorial = {
  qualityBar: {
    genuinelyFree: true,
    finished: true,
    activelyMaintained: true,
    standsAlone: true,
    highQuality: true,
    verdict:
      "Super Nova Strike clears the PlayBound Bar as a responsive, zero-fuss retro mobile shmup where tight finger controls and punchy wave progression deliver immediate coin-op satisfaction on your phone.",
    lastVerified: "2026-09-14",
  },
  longDescription:
    "Super Nova Strike is a fast-paced vertical arcade space shooter developed by BorgMobile, the mobile gaming division of TSYBORG LLC. Designed as a modern love letter to golden-era coin-op classics such as Galaga, Raiden, and Space Invaders, the game bypasses the bloat and aggressive monetization of modern mobile gaming to focus squarely on immediate, twitch-reflex arcade combat. Players command a lone vanguard starship dispatched into hazardous interstellar sectors overrun by aggressive alien swarms, drifting asteroid belts, and fortified armada battlegroups. Survival requires crisp situational awareness, rapid target prioritization, and seamless maneuvering across a vibrant screen filled with kinetic laser fire.\n\nMoment-to-moment combat is anchored by responsive touch-and-drag controls calibrated specifically for mobile screens. Your starship fires continuous salvos automatically, leaving your thumb free to direct micro-adjustments, dodge incoming projectile patterns, and thread through narrowing bullet curtains. Enemy waves enter in distinct tactical formations: nimble scout squadrons that dive-bomb from high angles, heavy armored gunships that lay down sweeping energy arcs, and shielded sentry drones that absorb fire to protect the fleet. Obliterating elite foes releases valuable floating power-up tokens that dynamically transform your firepower—expanding narrow single lasers into devastating wide-angle spreads, activating high-damage plasma bursts, and deploying temporary energy shielding to absorb stray hits.\n\nProgression is split across two core experiences: Classic Mode and Free Play. Classic Mode structures the fight into distinct sector waves, challenging players to clear each tier before facing off against colossal alien flagships. These end-of-sector boss encounters demand rigorous pattern recognition, as massive alien leviathans cycle through multi-phase attack routines involving rotating laser cannons, dense ring-shaped bullet barrages, and escort swarms. Free Play mode strips away sector checkpoints in favor of an endless, escalating survival gauntlet where enemy speed, durability, and bullet density scale continuously, testing high-score purists who want to push their reflexes to the absolute brink.\n\nThe audiovisual design embraces a sharp neon arcade aesthetic, combining dark cosmic backdrops with high-contrast, glowing energy projectiles and fiery explosion animations that keep critical hitboxes completely legible amid chaotic skirmishes. A pulsating electronic soundtrack and satisfying mechanical audio cues accompany every blown-up chassis and weapon pickup. For PlayBound, Super Nova Strike stands out as a genuine breath of fresh air in the mobile space: an unpretentious, polished shoot-'em-up that respects player time, delivers authentic arcade thrills on touchscreens, and never compromises its coin-op spirit behind paywalls.",
  whyWePickedIt:
    "We picked Super Nova Strike because it delivers genuine, unfiltered arcade shoot-'em-up action on mobile without predatory paywalls, mandatory account walls, or synthetic energy timers. It gives players honest, reflex-driven coin-op joy with responsive touch controls and colossal boss battles that feel earned on every run.",
  thatOneThing:
    "The split-second adrenaline rush of slipping through a dense spread of alien plasma to blow apart an armada flagship with a fully-stacked laser upgrade.",
  bestFor: [
    "Fans of classic 80s and 90s vertical arcade shmups like Galaga, 1942, and Raiden",
    "Players looking for quick, responsive action sessions on Android or iOS without intrusive onboarding",
    "Score-chasers who love bullet-dodging rhythms, boss fights, and stacking weapon power-ups",
  ],
  notFor: [
    "Players wanting a desktop PC or console release with dedicated keyboard or flight-stick mapping",
    "Anyone looking for deep narrative RPG progression, story cutscenes, or sprawling fleet management",
    "Players seeking online cooperative or competitive multiplayer modes",
  ],
  comparableTo: [
    "Galaga",
    "Raiden",
    "Sky Force Reloaded",
    "Space Invaders",
    "1942",
  ],
  installSteps: [
    {
      platform: "android" as const,
      text: "Open the Super Nova Strike Google Play Store listing from PlayBound.",
    },
    {
      platform: "android" as const,
      text: "Tap Install to download the official Android build directly to your smartphone or tablet.",
    },
    {
      platform: "android" as const,
      text: "Launch Super Nova Strike from your app drawer and jump straight into Classic or Free Play mode.",
    },
    {
      platform: "ios" as const,
      text: "Open the Super Nova Strike Apple App Store listing from PlayBound.",
    },
    {
      platform: "ios" as const,
      text: "Tap Get / Install to download the game to your iPhone, iPad, or iPod touch (requires iOS 13.0 or later).",
    },
    {
      platform: "ios" as const,
      text: "Launch the app from your home screen and swipe to pilot your starship into battle.",
    },
  ],
  faq: [
    {
      q: "Is Super Nova Strike free to play?",
      a: "Yes. Super Nova Strike is free to download and play on both Google Play (Android) and the Apple App Store (iOS) with no upfront purchase requirement.",
    },
    {
      q: "Can I play Super Nova Strike on PC or Mac?",
      a: "Super Nova Strike is officially built for mobile devices (smartphones and tablets running Android or iOS). It does not currently feature a native desktop launcher build on PC or Mac.",
    },
    {
      q: "What game modes are available in Super Nova Strike?",
      a: "The game features Classic Mode, where you advance through progressively tougher waves ending in massive boss battles, and Free Play Mode, which lets you test your endurance in endless high-score survival.",
    },
    {
      q: "What devices are supported?",
      a: "On iOS, the game supports iPhone and iPad running iOS 13.0 or later. On Android, it runs smoothly on modern Android smartphones and tablets (Android 8.0 and above).",
    },
    {
      q: "Does the game require an active internet connection to play?",
      a: "No. You can enjoy the single-player arcade waves and boss battles offline without an active network connection once installed.",
    },
  ],
};

export const superNovaStrikePatchSource = {
  title: "Super Nova Strike",
  tagline:
    "Fast arcade space shooter packed with neon laser salvos, nimble maneuvers, and colossal cosmic bosses.",
  description:
    "Super Nova Strike is an energetic retro-inspired arcade space shooter by BorgMobile. Pilot your starship across perilous sectors, weave through bullet curtains, grab weapon power-ups, and clash against colossal alien flagships in classic and free play modes.",
  developerSlug: "borgmobile",
  developerName: "BorgMobile",
  genres: ["Action", "Arcade", "Shooter"] as const,
  tags: [
    "Space",
    "Retro",
    "Arcade",
    "Bullet Hell",
    "Sci-Fi",
    "Mobile",
    "Touch Controls",
    "Singleplayer",
  ],
  license: "Freeware",
  releaseYear: 2024,
  sizeMB: 97,
  platforms: [...superNovaStrikePlatforms],
  features: ["Singleplayer", "Touch Controls", "Power-ups", "Boss Battles"],
  launchMethods: ["install"] as const,
  browserPlayable: false,
  steamDeck: false,
  steamAppId: null as string | null,
  website: superNovaStrikeWebsite,
  androidStoreUrl: superNovaStrikeAndroidStoreUrl,
  iosStoreUrl: superNovaStrikeIosStoreUrl,
  launcherInstall: superNovaStrikeLauncherInstall,
  systemRequirements: superNovaStrikeSystemRequirements,
  hardwareRequirements: superNovaStrikeHardwareRequirements,
  art: { from: "#1e1b4b", to: "#06b6d4", icon: "Rocket" },
  coverImage:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/80/94/3e/80943e19-f011-e1a2-8b13-01d89bf0afa9/AppIcon-1x_U007emarketing-0-7-0-85-220-0.png/1200x630wa.png",
  qualityBar: superNovaStrikeEditorial.qualityBar,
  longDescription: superNovaStrikeEditorial.longDescription,
  whyWePickedIt: superNovaStrikeEditorial.whyWePickedIt,
  thatOneThing: superNovaStrikeEditorial.thatOneThing,
  bestFor: superNovaStrikeEditorial.bestFor,
  notFor: superNovaStrikeEditorial.notFor,
  comparableTo: superNovaStrikeEditorial.comparableTo,
  installSteps: superNovaStrikeEditorial.installSteps,
  faq: superNovaStrikeEditorial.faq,
  complete: true,
};
