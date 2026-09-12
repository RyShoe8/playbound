import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorEvent from "@/lib/models/MirrorEvent";
import { filterCurrentArtifacts } from "@/lib/mirrors/currentArtifacts";
import { deleteObjectFromR2 } from "@/lib/mirrors/r2Client";
import { deleteArchivedArtifactOnHost } from "@/lib/gameHost/client";

export async function POST() {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();

    const allArtifacts = await Artifact.find({});
    const leanAll = allArtifacts.map((a) => a.toObject());
    const currentArtifacts = await filterCurrentArtifacts(leanAll, {
      launcherKeep: "latest",
    });
    const currentArtifactIds = new Set(currentArtifacts.map((a) => a.artifactId));

    const obsolete = allArtifacts.filter((a) => !currentArtifactIds.has(a.artifactId));

    if (!obsolete.length) {
      return NextResponse.json({
        ok: true,
        message: "No obsolete or old versions found — all files are current.",
        artifactsDeleted: 0,
        sourcesDeleted: 0,
        r2Evicted: 0,
      });
    }

    const actor = session?.user?.name || session?.user?.email || "admin";
    let r2Evicted = 0;
    let vpsDeleted = 0;

    for (const art of obsolete) {
      const isLauncher =
        art.artifactType === "launcher" ||
        String(art.artifactId).startsWith("playbound-launcher-");

      if (art.r2Status === "cached" || art.r2Status === "uploading" || art.r2Status === "candidate") {
        try {
          await deleteObjectFromR2(art.relativePath);
          const legacyKey = `artifacts/${art.artifactId}`;
          if (art.relativePath !== legacyKey) {
            await deleteObjectFromR2(legacyKey).catch(() => ({ success: false }));
          }
          r2Evicted += 1;
        } catch (err) {
          console.warn(`[prune-old] R2 delete failed for ${art.artifactId}:`, err);
        }
      }

      // Old launcher installers on the VPS are safe to drop — only the current
      // public version needs the durable archive for downloads / R2 reseed.
      if (isLauncher && art.relativePath) {
        try {
          const res = await deleteArchivedArtifactOnHost(art.relativePath);
          if (res.success) vpsDeleted += 1;
          const legacyPath = `artifacts/${art.artifactId}`;
          if (art.relativePath !== legacyPath) {
            await deleteArchivedArtifactOnHost(legacyPath).catch(() => ({ success: false }));
          }
        } catch (err) {
          console.warn(`[prune-old] VPS delete failed for ${art.artifactId}:`, err);
        }
      }
    }

    const obsoleteIds = obsolete.map((a) => a.artifactId);
    const artResult = await Artifact.deleteMany({
      artifactId: { $in: obsoleteIds },
    });
    const srcResult = await MirrorSource.deleteMany({
      artifactId: { $in: obsoleteIds },
    });

    await MirrorEvent.create({
      eventType: "manual_evict",
      actor,
      details: `${actor} cleaned ${artResult.deletedCount || 0} obsolete artifact(s); R2 evicted ${r2Evicted}; launcher VPS removed ${vpsDeleted}`,
    });

    return NextResponse.json({
      ok: true,
      message: `Cleaned ${artResult.deletedCount || 0} old version(s), evicted ${r2Evicted} from R2${
        vpsDeleted ? `, removed ${vpsDeleted} old launcher(s) from VPS` : ""
      }.`,
      artifactsDeleted: artResult.deletedCount || 0,
      sourcesDeleted: srcResult.deletedCount || 0,
      r2Evicted,
      vpsDeleted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
