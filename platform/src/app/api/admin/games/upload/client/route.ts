import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * Client-token endpoint for large video uploads (browser → Blob directly).
 * Images still use the smaller FormData route at /api/admin/games/upload.
 */
export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured on this environment" },
      { status: 503 }
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("games/") || !pathname.includes("/video-")) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["video/mp4", "video/webm", "video/quicktime"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          tokenPayload: JSON.stringify({ kind: "game-video" }),
        };
      },
      onUploadCompleted: async () => {
        /* Form merges the returned Blob URL; no DB write here. */
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Client video upload error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
