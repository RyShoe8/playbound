import { createHash } from "node:crypto";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { archivedArtifactStatusOnHost } from "@/lib/gameHost/client";

type UploadedPackage = {
  gameSlug: string;
  editionSlug?: string;
  version: string;
  filename: string;
  relativePath: string;
};

/** Register only bytes the host has verified; preserve cache policy and download history. */
export async function registerVerifiedUploadedPackage(input: UploadedPackage & { sizeBytes: number }) {
  await dbConnect();
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("Verified package size is missing or invalid");
  }
  const artifactId = `uploaded-package--${createHash("sha256").update(input.relativePath).digest("hex").slice(0, 24)}`;
  return Artifact.findOneAndUpdate(
    { relativePath: input.relativePath },
    {
      $set: {
        gameSlug: input.gameSlug, version: input.version, filename: input.filename,
        sizeBytes: input.sizeBytes, vpsStatus: "verified", vpsStatusMessage: null,
      },
      $setOnInsert: {
        artifactId, relativePath: input.relativePath,
        artifactType: input.editionSlug ? "edition" : "game",
        licenseStatus: "unknown", mirrorEnabled: false, redistributionAllowed: false,
        r2Status: "not_cached",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

type Recipe = { enabled?: boolean; url?: string; fileName?: string; versionLabel?: string };

function uploadedPackage(gameSlug: string, recipe: Recipe | null | undefined, version: string, editionSlug?: string): UploadedPackage | null {
  if (!recipe?.url || recipe.enabled === false || !recipe.fileName) return null;
  try {
    const url = new URL(recipe.url);
    if (url.origin !== "https://mirror.playbound.club") return null;
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const prefix = editionSlug
      ? `launcher-packages/editions/${gameSlug}/${editionSlug}/`
      : `launcher-packages/games/${gameSlug}/`;
    if (!relativePath.startsWith(prefix) || relativePath.split("/").some((part) => part === "." || part === "..") || relativePath.includes("\\")) return null;
    return { gameSlug, editionSlug, version, filename: recipe.fileName, relativePath };
  } catch {
    return null;
  }
}

/** Backfill current uploaded packages, not arbitrary files or catalog content. */
export async function syncUploadedPackageArtifacts() {
  await dbConnect();
  const [games, editions] = await Promise.all([
    CatalogGame.find({ "launcherInstall.url": /^https:\/\/mirror\.playbound\.club\/launcher-packages\// })
      .select("slug launcherInstall").lean(),
    Edition.find({ "installConfig.playbound_installer.url": /^https:\/\/mirror\.playbound\.club\/launcher-packages\// })
      .select("gameSlug slug version installConfig").lean(),
  ]);
  const packages: UploadedPackage[] = [];
  for (const game of games) {
    const recipe = game.launcherInstall as Recipe | undefined;
    const item = uploadedPackage(game.slug, recipe, recipe?.versionLabel || "unknown");
    if (item) packages.push(item);
  }
  for (const edition of editions) {
    const recipe = edition.installConfig?.playbound_installer as Recipe | undefined;
    const item = uploadedPackage(edition.gameSlug, recipe, edition.version || "unknown", edition.slug);
    if (item) packages.push(item);
  }
  if (!packages.length) return;
  const existing = await Artifact.find({
    relativePath: { $in: packages.map((item) => item.relativePath) }, vpsStatus: "verified", sizeBytes: { $gt: 0 },
  }).select("relativePath").lean();
  const registered = new Set(existing.map((item) => item.relativePath));
  const missing = packages.filter((item) => !registered.has(item.relativePath));
  // Bound host probes so initial reconciliation does not flood the agent/pool.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(missing.slice(i, i + 4).map(async (item) => {
      const remote = await archivedArtifactStatusOnHost(item.relativePath);
      if (remote?.status === "verified" && remote.sizeBytes) {
        await registerVerifiedUploadedPackage({ ...item, sizeBytes: remote.sizeBytes });
      }
    }));
  }
}
