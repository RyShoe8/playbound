/**
 * Production Mongo briefly stored Morrowind as singleplayer-only (no Multiplayer
 * feature, no `server` launch method, Windows-only platforms). That made
 * `isMultiplayer` false in the launcher catalog and hid TES3MP from the party
 * game picker. Restore seed multiplayer markers at read time.
 */

type LaunchMethod = string;

export type MorrowindRepairInput = {
  slug?: string;
  features?: string[];
  tags?: string[];
  launchMethods?: LaunchMethod[];
  platforms?: string[];
  steamDeck?: boolean;
};

export type MorrowindRepairSeed = {
  features?: string[];
  tags?: string[];
  launchMethods?: LaunchMethod[];
  platforms?: string[];
  steamDeck?: boolean;
};

function normalizePlatform(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function repairMorrowindMultiplayerFromSeed<T extends MorrowindRepairInput>(
  game: T,
  seed: MorrowindRepairSeed | null | undefined
): T {
  if (game.slug !== "morrowind" || !seed) return game;

  const hasMpFeature = (game.features || []).some((f) => /multi[-\s]?player/i.test(String(f)));
  const seedHasMp = (seed.features || []).some((f) => /multi[-\s]?player/i.test(String(f)));
  if (!seedHasMp) return game;

  let changed = false;
  const features = [...(game.features || [])];
  const tags = [...(game.tags || [])];
  const launchMethods = [...(game.launchMethods || [])];
  const platforms = [...(game.platforms || [])];

  if (!hasMpFeature) {
    for (const f of seed.features || []) {
      if (!/multi[-\s]?player|dedicated server|\bco-?op\b/i.test(String(f))) continue;
      if (features.some((x) => x.toLowerCase() === String(f).toLowerCase())) continue;
      features.push(f);
      changed = true;
    }
    for (const t of seed.tags || []) {
      if (!/multi[-\s]?player|\bco-?op\b/i.test(String(t))) continue;
      if (tags.some((x) => x.toLowerCase() === String(t).toLowerCase())) continue;
      tags.push(t);
      changed = true;
    }
  }

  if (seed.launchMethods?.includes("server") && !launchMethods.includes("server")) {
    launchMethods.push("server");
    changed = true;
  }

  // Prod briefly stored Windows-only; OpenMW/TES3MP party across desktop OSes.
  for (const p of seed.platforms || []) {
    if (!p) continue;
    if (platforms.some((x) => normalizePlatform(x) === normalizePlatform(p))) continue;
    platforms.push(p);
    changed = true;
  }

  const steamDeck = game.steamDeck || Boolean(seed.steamDeck);
  if (steamDeck !== Boolean(game.steamDeck)) changed = true;

  if (!changed) return game;
  return { ...game, features, tags, launchMethods, platforms, steamDeck };
}
