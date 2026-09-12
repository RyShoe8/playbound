import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import { put } from "@vercel/blob";
import { ensureArtifact, ensurePublicSource } from "@/lib/mirrors/ensureArtifact";
import { archiveArtifactToVps } from "@/lib/mirrors/cacheManager";
import { deleteArchivedArtifactOnHost } from "@/lib/gameHost/client";

const FILENAME_RE = /^PlayBound-Setup-(\d+\.\d+\.\d+)\.exe$/i;

const payload = z.object({
  fileName: z.string().regex(FILENAME_RE, "Expected PlayBound-Setup-<version>.exe"),
  sourceUrl: z.string().url().refine((v) => new URL(v).protocol === "https:", "Must be HTTPS"),
  sizeBytes: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "sha256 must be 64 hex characters")
    .optional(),
  sha512: z.string().optional(),
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
    if (input.sha512) artifact.sha512 = input.sha512;
    artifact.filename = input.fileName;

    /*
     * Heal a key that does not end in the filename.
     *
     * Rows created before ensureArtifact kept the filename for gameSlug-less
     * artifacts are stored at "artifacts/<artifactId>", and the VPS serves
     * that path verbatim — so a browser following the mirror fallback saves an
     * installer with no .exe on it. R2 can be told the right name through a
     * signed content-disposition, but a plain mirror URL cannot, so the key
     * itself has to carry it. Re-running this route repoints the row and
     * re-archives.
     *
     * The legacy object has to go first, and not merely for tidiness: it is a
     * *file* sitting on the exact path the new key needs as a *directory*, so
     * archiving fails with EEXIST on mkdir until it is gone. "artifacts/<id>"
     * belongs to this artifact alone, so removing it strands nothing. Done
     * unconditionally rather than only when the row still points there,
     * because a half-finished repoint leaves the row moved and the blocker
     * behind.
     */
    const legacyPath = `artifacts/${artifactId}`;
    const wantPath = `${legacyPath}/${input.fileName}`;
    if (artifact.relativePath !== wantPath) {
      artifact.relativePath = wantPath;
      artifact.vpsStatus = "missing";
      artifact.r2Status = "not_cached";
    }
    await deleteArchivedArtifactOnHost(legacyPath).catch(() => ({ success: false }));

    /*
     * ensureArtifact defaults every new row to unmirrorable — correct for
     * unknown third-party content, wrong for our own signed build. Matches
     * what the local upload script has always set for this same artifact type.
     */
    artifact.mirrorEnabled = true;
    artifact.redistributionAllowed = true;
    artifact.licenseStatus = "first_party";
    await artifact.save();

    /*
     * Publish the latest.yml update manifest so electron-updater generic provider
     * immediately discovers this new signed release. The download URL points to
     * https://playbound.club/api/launcher/download which serves straight from R2,
     * so zero bytes of the heavy binary live on or pass through Vercel Blob.
     */
    if (input.sha512) {
      try {
        const yml = `version: ${version}
files:
  - url: https://playbound.club/api/launcher/download
    sha512: ${input.sha512}
    size: ${input.sizeBytes}
path: ${input.fileName}
sha512: ${input.sha512}
releaseDate: '${new Date().toISOString()}'
`;
        await put("launcher/latest.yml", yml, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "text/yaml; charset=utf-8",
        });
      } catch (err) {
        console.warn("[launcher-release] Could not publish latest.yml manifest to Blob:", err);
      }
    }

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
