import CatalogGame from "@/lib/models/CatalogGame";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { games } from "@/lib/data/games";

/**
 * Normalizes version strings for version comparisons (e.g. "0.2.97" -> [0, 2, 97]).
 */
function parseSemVer(v: string | null | undefined): number[] {
  if (!v) return [0];
  const parts = String(v)
    .replace(/^[^\d]*/, "")
    .split(/[^\d]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
  return parts.length ? parts : [0];
}

function compareSemVer(a: string | null | undefined, b: string | null | undefined): number {
  const pA = parseSemVer(a);
  const pB = parseSemVer(b);
  const len = Math.max(pA.length, pB.length);
  for (let i = 0; i < len; i++) {
    const numA = pA[i] ?? 0;
    const numB = pB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

export type MinimalArtifact = {
  artifactId: string;
  gameSlug?: string | null;
  version?: string | null;
  filename?: string | null;
  artifactType?: string | null;
};

/**
 * Filter an array of artifacts so only current, active install files remain:
 * - Launcher: Only the newest version for each platform.
 * - Games: Only active games matching their current install recipe.
 * - Superseded / retired / legacy versions are pruned from the list.
 */
export async function filterCurrentArtifacts<T extends MinimalArtifact>(artifacts: T[]): Promise<T[]> {
  if (!artifacts || !artifacts.length) return [];

  // 1. Gather all active game slugs from CatalogGame and static catalog
  const catalogDocs = await CatalogGame.find({}).select("slug launcherInstall").lean().catch(() => []);
  const activeGameMap = new Map<string, { version?: string; fileName?: string }>();

  // Add all static catalog recipes
  for (const game of games) {
    if (game.slug) {
      activeGameMap.set(game.slug, {});
    }
  }
  for (const [slug, recipe] of Object.entries(launcherInstallBySlug)) {
    if (recipe && recipe.enabled !== false) {
      activeGameMap.set(slug, {
        version: recipe.versionLabel || undefined,
        fileName: recipe.fileName || undefined,
      });
    }
  }
  // Add database catalog games
  for (const doc of catalogDocs) {
    const li = doc.launcherInstall as { enabled?: boolean; versionLabel?: string; fileName?: string } | undefined;
    if (li && li.enabled !== false) {
      activeGameMap.set(doc.slug, {
        version: li.versionLabel || undefined,
        fileName: li.fileName || undefined,
      });
    }
  }

  // 2. Identify the highest launcher version for each platform (windows, macos, linux)
  const latestLauncherByPlatform = new Map<string, { artifact: T; version: string }>();
  for (const art of artifacts) {
    if (art.artifactType === "launcher" || art.artifactId.startsWith("playbound-launcher-")) {
      const match = art.artifactId.match(/playbound-launcher-([a-z0-9]+)-(.+)/i);
      const platform = match ? match[1].toLowerCase() : "windows";
      const ver = art.version || (match ? match[2] : "0.0.0");
      const existing = latestLauncherByPlatform.get(platform);
      if (!existing || compareSemVer(ver, existing.version) > 0) {
        latestLauncherByPlatform.set(platform, { artifact: art, version: ver });
      }
    }
  }
  const currentLauncherArtifactIds = new Set(
    Array.from(latestLauncherByPlatform.values()).map((entry) => entry.artifact.artifactId)
  );

  // 3. For each active game slug, keep the latest / matching artifact
  const gameArtifactsBySlug = new Map<string, T[]>();
  for (const art of artifacts) {
    if (art.gameSlug) {
      const list = gameArtifactsBySlug.get(art.gameSlug) || [];
      list.push(art);
      gameArtifactsBySlug.set(art.gameSlug, list);
    }
  }

  const currentGameArtifactIds = new Set<string>();
  for (const [slug, arts] of gameArtifactsBySlug.entries()) {
    // Check if the game is active in catalog
    if (!activeGameMap.has(slug)) continue;
    const recipe = activeGameMap.get(slug);

    // If there's an exact recipe filename or version match, prefer it
    let matched = arts.find(
      (a) =>
        (recipe?.fileName && a.filename === recipe.fileName) ||
        (recipe?.version && a.version === recipe.version)
    );

    // Otherwise pick the newest version
    if (!matched) {
      matched = arts.slice().sort((a, b) => compareSemVer(b.version, a.version))[0];
    }

    if (matched) {
      currentGameArtifactIds.add(matched.artifactId);
    }
  }

  // 4. Return only artifacts matching current rules
  return artifacts.filter((art) => {
    // Current launcher artifact
    if (art.artifactType === "launcher" || art.artifactId.startsWith("playbound-launcher-")) {
      return currentLauncherArtifactIds.has(art.artifactId);
    }
    // Current game artifact
    if (art.gameSlug) {
      return currentGameArtifactIds.has(art.artifactId);
    }
    // Non-game artifacts (e.g. shared tools/mods) that have active sources
    return art.artifactType === "mod" || art.artifactType === "tool";
  });
}
