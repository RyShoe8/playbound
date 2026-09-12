import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import { put } from "@vercel/blob";
import { ensureArtifact, ensurePublicSource } from "@/lib/mirrors/ensureArtifact";
import { archiveArtifactToVps } from "@/lib/mirrors/cacheManager";
import { deleteArchivedArtifactOnHost } from "@/lib/gameHost/client";
import {
  WINDOWS_SETUP_FILENAME_RE,
  buildSignedWindowsLatestYml,
  ensureLauncherRelativePath,
} from "@/lib/launcherUpdateFeed";

const payload = z.object({
  fileName: z
    .string()
    .regex(WINDOWS_SETUP_FILENAME_RE, "Expected PlayBound-Setup-<version>.exe"),
  sourceUrl: z.string().url().refine((v) => new URL(v).protocol === "https:", "Must be HTTPS"),
  sizeBytes: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "sha256 must be 64 hex characters")
    .optional(),
  sha512: z.string().min(1, "sha512 is required for public auto-update"),
});

/**
 * Register a signed launcher installer, publish latest.yml, and archive to the VPS.
 *
 * This is the canonical public Windows release path (Admin upload → Promote to R2).
 * Runs on Vercel so MONGODB_URI and GAME_HOST_SECRET are available — local
 * `upload:launcher --prod` cannot archive to the VPS and is refused for Windows.
 *
 * latest.yml file URLs must end with PlayBound-Setup-<version>.exe; electron-updater
 * caches by URL basename and would otherwise save a file named "download".
 */
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const input = payload.parse(await req.json());
    const version = WINDOWS_SETUP_FILENAME_RE.exec(input.fileName)![1];
    const artifactId = `playbound-launcher-windows-${version}`;

    await dbConnect();

    const artifact = await ensureArtifact({
      artifactId,
      gameSlug: null,
      version,
      filename: input.fileName,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256 || null,
      sha512: input.sha512 || null,
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
    artifact.sha512 = input.sha512;
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
    const { relativePath: wantPath, healed } = ensureLauncherRelativePath(
      artifactId,
      input.fileName,
      artifact.relativePath
    );
    if (healed || artifact.relativePath !== wantPath) {
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
     * Publish latest.yml for electron-updater. The file URL *must* end with
     * .exe — electron-updater caches by URL basename, and a bare
     * /api/launcher/download path becomes a file named "download".
     */
    try {
      const yml = buildSignedWindowsLatestYml({
        version,
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        sha512: input.sha512,
      });
      await put("launcher/latest.yml", yml, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/yaml; charset=utf-8",
      });
    } catch (err) {
      console.error("[launcher-release] Refusing to continue without latest.yml:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Could not publish latest.yml (update feed must end with .exe)",
        },
        { status: 500 }
      );
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
