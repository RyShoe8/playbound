import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { probeS3Archive } from "@/lib/mirrors/s3Archive";

/** Explicit admin action: writes and removes one tiny object in the private bucket. */
export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    return NextResponse.json({ ok: true, checks: await probeS3Archive() });
  } catch (error) {
    console.error("S3 archive probe failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "S3 probe failed" }, { status: 502 });
  }
}
