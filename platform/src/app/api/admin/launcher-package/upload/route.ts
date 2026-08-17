import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024 * 1024;

/** Temporary browser-to-Blob upload token for a launcher package.
 * The package is copied to the VPS and only then made live by the companion
 * route. Nothing in the catalog is written at this stage. */
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
        if (!pathname.startsWith("launcher-packages/")) throw new Error("Invalid package path");
        return {
          allowedContentTypes: ["application/zip", "application/x-7z-compressed", "application/octet-stream"],
          maximumSizeInBytes: MAX_PACKAGE_BYTES,
          tokenPayload: JSON.stringify({ kind: "launcher-package" }),
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
