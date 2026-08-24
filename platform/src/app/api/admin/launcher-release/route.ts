import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ensureArtifact, ensurePublicSource } from "@/lib/mirrors/ensureArtifact";
import { archiveArtifactToVps } from "@/lib/mirrors/cacheManager";

const FILENAME_RE = /^PlayBound-Setup-(\d+\.\d+\.\d+)\.exe$/i;

const payload = z.object({
  fileName: z.string().regex(FILENAME_RE, "Expected PlayBound-Setup-<version>.exe"),
  sourceUrl: z.string().url().refine((v) => new URL(v).protocol === "https:", "Must be HTTPS"),
  sizeBytes: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "sha256 must be 64 hex characters")
    .optional(),
});

/**
 * Register a signed launcher installer and archive it to the VPS.
 *
 * Runs on Vercel, so it has the production MONGODB_URI and GAME_HOST_SECRET
 * that a local machine cannot obtain — those two are Vercel "Sensitive"
 * variables, and `vercel env pull` structurally cannot retrieve them. Every
 * local run of scripts/upload-launcher.ts has published to Blob correctly and
 * then silently failed to reach the VPS for exactly that reason. This route
 * is the fix: the admin uploads through the browser, already-authenticated,
 * and the archive happens server-side where the real credentials already
 * live.
 *
 * ensureArtifact is called directly rather than relying on the self-heal
 * fallback inside archiveArtifactToVps, because that fallback requires a
 * gameSlug — reasonable for a game package with a missing bookkeeping row,
 * but a launcher release has no gameSlug at all. Creating the record here,
 * deliberately, is what makes a *first-ever* upload of a given version work.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const input = payload.parse(await req.json());
    const version = FILENAME_RE.exec(input.fileName)![1];
    const artifactId = `playbound-launcher-windows-${version}`;

    await dbConnect();

    const artifact = await ensureArtifact({
      artifactId,
      gameSlug: null,
      version,
      filename: input.fileName,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256 || null,
      artifactType: "launcher",
    });
    if (!artifact) {
      return NextResponse.json({ error: "Could not create the artifact record" }, { status: 500 });
    }

    /*
     * ensureArtifact only fills sizeBytes/sha256 when the row was previously
     * empty — right for its normal "record what a random download told us"
     * callers, wrong here: a re-upload of the same version (a rebuild, or a
     * re-run after this route failed partway) must overwrite whatever an
     * earlier call stored, or the VPS validates the new bytes against a stale
     * expected size and 416s trying to "resume" a file that's already whole.
     */
    artifact.sizeBytes = input.sizeBytes;
    if (input.sha256) artifact.sha256 = input.sha256;
    artifact.filename = input.fileName;

    /*
     * ensureArtifact defaults every new row to unmirrorable — correct for
     * unknown third-party content, wrong for our own signed build. Matches
     * what the local upload script has always set for this same artifact type.
     */
    artifact.mirrorEnabled = true;
    artifact.redistributionAllowed = true;
    artifact.licenseStatus = "first_party";
    await artifact.save();

    await ensurePublicSource({
      artifactId,
      sourceId: `blob-windows-admin-${version}`,
      url: input.sourceUrl,
    });

    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await archiveArtifactToVps(artifactId, actor, input.sourceUrl);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      artifactId,
      relativePath: artifact.relativePath,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not register the launcher release" },
      { status: 400 }
    );
  }
}
