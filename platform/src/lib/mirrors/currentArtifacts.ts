import CatalogGame from "@/lib/models/CatalogGame";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { games } from "@/lib/data/games";
import {
  compareSemVer,
  launcherPlatformFromArtifactId,
  launcherVersionFromArtifact,
} from "@/lib/mirrors/semver";

export type MinimalArtifact = {
  artifactId: string;
  gameSlug?: string | null;
  version?: string | null;
  filename?: string | null;
  artifactType?: string | null;
};

function isLauncherArtifact(art: MinimalArtifact): boolean {
  return art.artifactType === "launcher" || art.artifactId.startsWith("playbound-launcher-");
}

/**
 * Filter artifacts for the admin cache table / prune helpers.
 *
 * - Launchers: keep every launcher row by default so a just-uploaded Setup.exe
 *   always appears (even if a newer stub version exists). Pass
 *   `launcherKeep: "latest"` for prune-old so superseded installer rows go away.
 * - Games: only active catalog recipes / newest matching install.
 */
export async function filterCurrentArtifacts<T extends MinimalArtifact>(
  artifacts: T[],
  options?: { launcherKeep?: "all" | "latest" }
): Promise<T[]> {
  if (!artifacts || !artifacts.length) return [];
  const launcherKeep = options?.launcherKeep ?? "all";

  const catalogDocs = await CatalogGame.find({}).select("slug launcherInstall").lean().catch(() => []);
  const activeGameMap = new Map<string, { version?: string; fileName?: string }>();

  for (const game of games) {
    if (game.slug) activeGameMap.set(game.slug, {});
  }
  for (const [slug, recipe] of Object.entries(launcherInstallBySlug)) {
    if (recipe && recipe.enabled !== false) {
      activeGameMap.set(slug, {
        version: recipe.versionLabel || undefined,
        fileName: recipe.fileName || undefined,
      });
    }
  }
  for (const doc of catalogDocs) {
    const li = doc.launcherInstall as
      | { enabled?: boolean; versionLabel?: string; fileName?: string }
      | undefined;
    if (li && li.enabled !== false) {
      activeGameMap.set(doc.slug, {
        version: li.versionLabel || undefined,
        fileName: li.fileName || undefined,
      });
    }
  }

  const latestLauncherByPlatform = new Map<string, { artifact: T; version: string }>();
  for (const art of artifacts) {
    if (!isLauncherArtifact(art)) continue;
    const platform = launcherPlatformFromArtifactId(art.artifactId);
    const ver = launcherVersionFromArtifact(art);
    const existing = latestLauncherByPlatform.get(platform);
    if (!existing || compareSemVer(ver, existing.version) > 0) {
      latestLauncherByPlatform.set(platform, { artifact: art, version: ver });
    }
  }
  const currentLauncherArtifactIds = new Set(
    Array.from(latestLauncherByPlatform.values()).map((entry) => entry.artifact.artifactId)
  );

  const baseGameArtifactsBySlug = new Map<string, T[]>();
  const editionArtifacts = new Set<string>();

  for (const art of artifacts) {
    if (art.artifactType === "edition") {
      if (art.gameSlug && activeGameMap.has(art.gameSlug)) {
        editionArtifacts.add(art.artifactId);
      }
    } else if (art.gameSlug && art.artifactType !== "mod" && art.artifactType !== "tool") {
      if (isLauncherArtifact(art)) continue;
      const list = baseGameArtifactsBySlug.get(art.gameSlug) || [];
      list.push(art);
      baseGameArtifactsBySlug.set(art.gameSlug, list);
    }
  }

  const currentGameArtifactIds = new Set<string>();
  for (const [slug, arts] of baseGameArtifactsBySlug.entries()) {
    if (!activeGameMap.has(slug)) continue;
    const recipe = activeGameMap.get(slug);

    let matched = arts.find(
      (a) =>
        (recipe?.fileName && a.filename === recipe.fileName) ||
        (recipe?.version && a.version === recipe.version)
    );

    if (!matched) {
      matched = arts.slice().sort((a, b) => compareSemVer(b.version, a.version))[0];
    }

    if (matched) currentGameArtifactIds.add(matched.artifactId);
  }

  return artifacts.filter((art) => {
    if (isLauncherArtifact(art)) {
      return launcherKeep === "all" || currentLauncherArtifactIds.has(art.artifactId);
    }
    if (art.artifactType === "edition") {
      return editionArtifacts.has(art.artifactId);
    }
    if (art.gameSlug && art.artifactType !== "mod" && art.artifactType !== "tool") {
      return currentGameArtifactIds.has(art.artifactId);
    }
    return art.artifactType === "mod" || art.artifactType === "tool";
  });
}
