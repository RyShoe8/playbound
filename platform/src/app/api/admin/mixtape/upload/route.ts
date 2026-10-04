import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
export async function POST(req: Request) {
  const { error } = await requireAdminSession(); if (error) return error;
  try {
    return NextResponse.json(await handleUpload({ body: await req.json() as HandleUploadBody, request: req,
      onBeforeGenerateToken: async pathname => {
        if (!/^mixtape\/[a-zA-Z0-9_-]+\.(ogg|mp3|wav|png|jpg|jpeg)$/i.test(pathname)) throw new Error("Invalid music upload path");
        return { maximumSizeInBytes: 50 * 1024 * 1024, allowedContentTypes: ["audio/ogg", "application/ogg", "audio/mpeg", "audio/wav", "audio/x-wav", "image/png", "image/jpeg"], tokenPayload: "mixtape" };
      }, onUploadCompleted: async () => {},
    }));
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 }); }
}
