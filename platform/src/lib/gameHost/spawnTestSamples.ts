import dbConnect from "@/lib/db";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CatalogGame from "@/lib/models/CatalogGame";
import { HOSTABLE_SLUG_ALIASES } from "@/lib/gameHost/catalog";
import { recordResourceSample, type MeasuredSample } from "@/lib/communityHosting/samples";
import type { SpawnTestResult } from "@/lib/gameHost/client";

/** A spawn test measures one idle base-game recipe, never an edition or player load. */
export function idleSamplesFromSpawnTest(result: SpawnTestResult, requestedSlug?: string): MeasuredSample[] {
  if (!result.ok) return [];
  const entries = result.results
    ? Object.entries(result.results)
    : result.gameSlug && result.gameSlug === requestedSlug ? [[result.gameSlug, result] as const] : [];
  return entries.flatMap(([slug, test]) => {
    const resources = test.resources;
    if (!test.ok || test.skipped || !/^[a-z0-9_-]+$/.test(slug) || HOSTABLE_SLUG_ALIASES[slug] ||
      !resources || !Number.isFinite(resources.rssBytes) || (resources.rssBytes ?? 0) <= 0 ||
      !Number.isFinite(resources.cpuCores) || (resources.cpuCores ?? -1) < 0) return [];
    return [{
      profileKey: `${slug}:base`, observedAt: new Date(), players: 0,
      cpuCores: resources.cpuCores!, ramBytes: resources.rssBytes!,
      phase: "idle" as const, source: "audit" as const,
      ...(Number.isFinite(resources.sampleIntervalMs) && (resources.sampleIntervalMs ?? 0) > 0
        ? { sampleIntervalMs: resources.sampleIntervalMs } : {}),
      ...(Number.isInteger(resources.processCount) && (resources.processCount ?? 0) > 0
        ? { processCount: resources.processCount } : {}),
      ...(resources.scope === "process-group" ? { scope: resources.scope } : {}),
    }];
  });
}

/** Insert only operational profiles; existing verification and automation flags are untouched. */
export async function recordSpawnTestSamples(result: SpawnTestResult, requestedSlug?: string): Promise<number> {
  const samples = idleSamplesFromSpawnTest(result, requestedSlug);
  if (!samples.length) return 0;
  await dbConnect();
  const slugs = samples.map((sample) => sample.profileKey.slice(0, -":base".length));
  const catalog = await CatalogGame.find({ slug: { $in: slugs } }).select({ slug: 1 }).lean();
  const known = new Set(catalog.map((game) => game.slug));
  let recorded = 0;
  for (const sample of samples) {
    const slug = sample.profileKey.slice(0, -":base".length);
    if (!known.has(slug)) continue;
    await CommunityServerProfile.updateOne({ key: sample.profileKey }, {
      $setOnInsert: {
        key: sample.profileKey, gameSlug: slug, editionSlug: null, recipeSlug: slug,
        enabled: false, rotationEligible: false, verification: "testing",
        queryVerified: false, joinVerified: false,
      },
    }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    if (await recordResourceSample(sample)) recorded++;
  }
  return recorded;
}
