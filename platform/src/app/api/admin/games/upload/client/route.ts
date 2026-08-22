import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

/**
 * Client-token endpoint for browser → Blob direct uploads.
 * Bypasses Vercel Serverless Function 4.5MB request body size limit so large
 * 5MB+ screenshots and 100MB videos upload directly from the browser.
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
        const allowedPrefixes = ["games/", "mods/", "editions/", "gear/", "uploads/"];
        if (!allowedPrefixes.some((p) => pathname.startsWith(p))) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/avif",
            "image/svg+xml",
            "image/bmp",
            "video/mp4",
            "video/webm",
            "video/quicktime",
          ],
          maximumSizeInBytes: MAX_MEDIA_BYTES,
          tokenPayload: JSON.stringify({ kind: "admin-media" }),
        };
      },
      onUploadCompleted: async () => {
        /* Form merges the returned Blob URL; no DB write here. */
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Client media upload error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
