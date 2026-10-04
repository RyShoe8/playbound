import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import MixtapeUpload from "@/lib/models/MixtapeUpload";
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession(); if (error) return error;
  try {
    const body = await req.json() as HandleUploadBody;
    const response = await handleUpload({ body, request: req,
      onBeforeGenerateToken: async pathname => {
        const name = pathname.replace(/^mixtape-staging\//, "");
        const job = await MixtapeUpload.findOne({ name, userId: session!.user.id, state: "staging" }).lean();
        if (!job || pathname !== `mixtape-staging/${job.name}`) throw new Error("Invalid staging upload");
        return { allowedContentTypes: [job.contentType, "application/octet-stream"], maximumSizeInBytes: job.size, addRandomSuffix: false, allowOverwrite: false };
      }, onUploadCompleted: async () => {},
    });
    return NextResponse.json(response);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Staging failed" }, { status: 400 }); }
}
