import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";

/** Windows installers only ship over ~90MB today; well past double that is a mistake, not a bigger release. */
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;

/**
 * Client-to-Blob upload token for a signed launcher installer.
 *
 * The bytes go straight from the admin's browser to Blob, bypassing Vercel's
 * serverless request-body limit — the same reason /api/admin/launcher-package
 * exists for game packages. This is that route's counterpart for the launcher
 * app itself, kept separate because the two are validated differently: a
 * launcher release is always exactly PlayBound-Setup-x.y.z.exe, never a zip.
 */
export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob uploads are not configured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("launcher/staged/")) throw new Error("Invalid upload path");
        if (!/^launcher\/staged\/PlayBound-Setup-\d+\.\d+\.\d+\.exe$/i.test(pathname)) {
          throw new Error("Expected PlayBound-Setup-<version>.exe");
        }
        return {
          allowedContentTypes: ["application/octet-stream", "application/x-msdownload"],
          maximumSizeInBytes: MAX_INSTALLER_BYTES,
          tokenPayload: JSON.stringify({ kind: "launcher-release" }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }
}
