import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";

/**
 * The demo rows the old mirror seeder inserted, and the code to remove them.
 *
 * `ensureSeedArtifacts()` used to run on every admin page load and, when the
 * Artifact collection was empty, insert these five with invented figures — 842
 * downloads for HoloCure, 620 for Warzone 2100. Real downloads then added to
 * those baselines, so the admin table mixed fiction with fact and could not be
 * read either way.
 *
 * The seeder is gone; this clears what it already wrote.
 */

/** Exactly the ids INITIAL_ARTIFACTS defined — nothing is pattern-matched. */
export const SEEDED_ARTIFACT_IDS = [
  "holocure-0.7.1",
  "openra-2026.03",
  "warzone2100-4.5.1",
  "flightgear-2020.3.18",
  "endless-sky-0.10.4",
] as const;

export type SeededArtifactReport = {
  artifacts: Array<{ artifactId: string; totalDownloads: number; recentDownloads: number }>;
  sourceCount: number;
};

/** What is still there, without changing anything. */
export async function findSeededArtifacts(): Promise<SeededArtifactReport> {
  const artifacts = await Artifact.find({ artifactId: { $in: [...SEEDED_ARTIFACT_IDS] } })
    .select("artifactId totalDownloads recentDownloads")
    .lean();

  const sourceCount = await MirrorSource.countDocuments({
    artifactId: { $in: [...SEEDED_ARTIFACT_IDS] },
  });

  return {
    artifacts: artifacts.map((a) => ({
      artifactId: String(a.artifactId),
      totalDownloads: Number(a.totalDownloads) || 0,
      recentDownloads: Number(a.recentDownloads) || 0,
    })),
    sourceCount,
  };
}

/**
 * Delete them.
 *
 * Scoped to the five ids above, so an artifact registered by a real download
 * survives even when it is for the same game — a real HoloCure row carries its
 * own version in the id and is not in this list.
 */
export async function clearSeededArtifacts(): Promise<{
  artifactsDeleted: number;
  sourcesDeleted: number;
}> {
  const artifacts = await Artifact.deleteMany({
    artifactId: { $in: [...SEEDED_ARTIFACT_IDS] },
  });
  const sources = await MirrorSource.deleteMany({
    artifactId: { $in: [...SEEDED_ARTIFACT_IDS] },
  });

  return {
    artifactsDeleted: artifacts.deletedCount || 0,
    sourcesDeleted: sources.deletedCount || 0,
  };
}
