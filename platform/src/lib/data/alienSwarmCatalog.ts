/**
 * Alien Swarm (Valve, Steam app 630) — editorial + hardware catalog patch.
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 * Does not touch launcherInstall, media, status, or Reactive Drop.
 */
export const ALIEN_SWARM_SLUG = "alien-swarm" as const;

export const alienSwarmSystemRequirements = {
  min: "Windows 7 / Vista / XP · Pentium 4 3.0 GHz · 1 GB RAM (XP) / 2 GB (Vista+) · DX9 GPU 128 MB SM 2.0 · 2.5 GB storage",
  recommended:
    "Windows 7+ · Core 2 Duo 2.4 GHz · 2 GB RAM · DX9 GPU SM 3.0 (GeForce 7600 / Radeon X1600 or better) · 2.5 GB storage",
} as const;

export const alienSwarmHardwareRequirements = {
  min: {
    ramMB: 2048,
    storageMB: 2560,
    apis: ["dx9"],
    cpuText: "Pentium 4 3.0 GHz",
    gpuText: "DirectX 9, 128 MB, Shader Model 2.0 (ATI X800 / NVIDIA 6600 or better)",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "Steam client requires Windows 10 or later as of 2024",
  },
  recommended: {
    ramMB: 2048,
    storageMB: 2560,
    apis: ["dx9"],
    cpuText: "Intel Core 2 Duo 2.4 GHz",
    gpuText: "DirectX 9 Shader Model 3.0 (NVIDIA 7600 / ATI X1600 or better)",
    cpuTier: "low",
    gpuTier: "entry",
    notes: "Steam client requires Windows 10 or later as of 2024",
  },
  provenance: {
    source: "developer" as const,
  },
};

export const alienSwarmEditorial = {
  qualityBar: {
    genuinelyFree: true,
    finished: true,
    activelyMaintained: false,
    standsAlone: true,
    highQuality: true,
    verdict:
      "Alien Swarm clears the PlayBound Bar as a complete, free Valve co-op shooter with campaign polish that still holds up — and Reactive Drop keeps the swarm alive when you want the modern continuation.",
    lastVerified: "2026-09-11",
  },
  longDescription:
    "Alien Swarm is Valve's top-down co-op shooter: four marines drop into claustrophobic corridors, burn through ammo, and try not to get overrun by a hive that never stops coming. Classes matter — officer, special weapons, medic, tech — and so does not shooting your teammates when the hallway fills with parasites.\n\nIt shipped free on Steam in 2010 as a polished Source engine campaign with bots if friends are scarce. Missions are short, readable, and built around teamwork: cover the tech while they weld, keep the medic alive, and clear nests before the next wave spills out. The campaign is complete; there is no shop gate between you and the ending.\n\nOn PlayBound we list the original free Steam build. Controller support is partial on classic Swarm (console exec / Steam Input help); the community continuation Alien Swarm: Reactive Drop is the better pad-first option when you want official full controller support and a still-active multiplayer scene.",
  whyWePickedIt:
    "We picked Alien Swarm because it is a finished Valve co-op campaign that costs nothing, plays cleanly in a short evening, and still teaches the same squad habits that later free shooters borrow. It is free gaming with a capital V.",
  thatOneThing:
    "The corridor where the swarm pours in from both ends and your medic is the only reason anyone makes the extraction.",
  bestFor: [
    "Players who want a short, finished free co-op campaign",
    "Friends who like top-down squad shooters over battle royale",
    "Anyone curious about Valve's free experiments on Source",
  ],
  notFor: [
    "Players who need modern native full controller support without Steam Input fiddling",
    "Anyone looking for a live service with seasonal content (see Reactive Drop)",
    "Solo players who dislike bots filling empty slots",
  ],
  comparableTo: [
    "Alien Swarm: Reactive Drop",
    "Left 4 Dead 2",
    "Deep Rock Galactic",
    "Helldivers",
  ],
  installSteps: [
    {
      platform: "windows" as const,
      text: "Choose Install in PlayBound. Steam opens the free Alien Swarm app (630) — sign in if needed and let Steam finish the download.",
    },
    {
      platform: "windows" as const,
      text: "Return to PlayBound and press Play. For controllers, use Steam Input or the game's documented 360controller console exec; Reactive Drop is easier if you want official full pad support.",
    },
  ],
  faq: [
    {
      q: "Is Alien Swarm free?",
      a: "Yes. Valve released it free on Steam. PlayBound hands off to Steam for download and updates — there is no separate PlayBound-hosted package.",
    },
    {
      q: "How is this different from Alien Swarm: Reactive Drop?",
      a: "Alien Swarm is Valve's original 2010 campaign. Reactive Drop is the free community continuation with more content, active multiplayer, and official full controller support. Both are listed separately on PlayBound.",
    },
    {
      q: "Does it support controllers?",
      a: "Partially. Classic Swarm often needs Steam Input or console commands. Reactive Drop ships official full controller support.",
    },
    {
      q: "Can I play offline?",
      a: "The campaign supports local play with bots. Online co-op needs Steam and a network connection.",
    },
  ],
};

export const alienSwarmPatchSource = {
  ...alienSwarmEditorial,
  systemRequirements: alienSwarmSystemRequirements,
  hardwareRequirements: alienSwarmHardwareRequirements,
};
