/**
 * Gathers every install recipe PlayBound ships into one checkable list.
 *
 * Recipes live in three places for historical reasons — the launcher recipe
 * map, edition install configs, and mod download fields — and a checker that
 * only knew about one of them would give false confidence. Kept separate from
 * check.ts so the collection logic stays testable without network access.
 */
import type { CheckableRecipe } from "./check";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { editions } from "@/lib/data/editions";
import { mods } from "@/lib/data/mods";

/** Game install recipes, keyed "game:<slug>". */
export function collectGameRecipes(): CheckableRecipe[] {
  return Object.entries(launcherInstallBySlug)
    .filter(([, r]) => r?.enabled !== false)
    .map(([slug, r]) => {
      const rec = r as Record<string, unknown>;
      const addons = Array.isArray(rec.addons) ? (rec.addons as Record<string, unknown>[]) : [];
      return {
        id: `game:${slug}`,
        kind: typeof rec.kind === "string" ? rec.kind : null,
        repo: typeof rec.repo === "string" ? rec.repo : null,
        assetPattern: typeof rec.assetPattern === "string" ? rec.assetPattern : null,
        url: typeof rec.url === "string" ? rec.url : null,
        // Addons are optional at install time, so a broken one does not stop
        // the base install — but it is still a broken promise on the page.
        extraUrls: addons
          .map((a) => (typeof a.url === "string" ? a.url : null))
          .filter((u): u is string => Boolean(u)),
      };
    });
}

/** Edition install recipes, keyed "edition:<game>/<edition>". */
export function collectEditionRecipes(): CheckableRecipe[] {
  const out: CheckableRecipe[] = [];
  for (const e of editions) {
    const cfg = e.installConfig?.playbound_installer;
    if (!cfg) continue;
    const loaderUrls = (cfg.modLoader?.files ?? []).map((f) => f.url);
    out.push({
      id: `edition:${e.gameSlug}/${e.slug}`,
      kind: cfg.kind ?? null,
      repo: cfg.repo ?? null,
      assetPattern: cfg.assetPattern ?? null,
      url: cfg.url ?? null,
      extraUrls: [
        ...loaderUrls,
        ...(cfg.overlayUrl ? [cfg.overlayUrl] : []),
      ],
    });
  }
  return out;
}

/** Mod downloads, keyed "mod:<slug>". */
export function collectModRecipes(): CheckableRecipe[] {
  return mods
    // External mods are link-outs handled by the game's own add-on manager;
    // there is no download for us to resolve, and their website is checked
    // by the link audit rather than here.
    .filter((m) => m.downloadKind !== "external")
    .map((m) => ({
      id: `mod:${m.slug}`,
      kind: m.downloadKind,
      repo: m.githubRepo ?? null,
      assetPattern: m.assetPattern ?? null,
      url: m.directUrl ?? null,
      // Mods degrade to the default-branch source archive; games do not.
      sourceArchiveFallback: true,
    }));
}

export function collectAllRecipes(): CheckableRecipe[] {
  return [...collectGameRecipes(), ...collectEditionRecipes(), ...collectModRecipes()];
}
