import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { checkR2ObjectExists, getR2PresignedUploadUrl, r2HotcacheConfigured } from "@/lib/mirrors/r2Client";
import { SITE_URL } from "@/lib/site";
import { validateUpload, validAssetName } from "@/lib/mixtape/storage";
export async function POST(req: Request) {
  const { error } = await requireAdminSession(); if (error) return error;
  if (!r2HotcacheConfigured()) return NextResponse.json({ error: "R2 hotcache is not configured" }, { status: 503 });
  try {
    const body = await req.json();
    if (body.action === "complete") {
      if (!validAssetName(body.name)) throw new Error("Invalid music object");
      const size = Number(body.size);
      if (!Number.isInteger(size) || size < 1 || size > 50 * 1024 * 1024) throw new Error("Invalid upload size");
      const object = await checkR2ObjectExists(`mixtape/${body.name}`);
      if (!object.exists || object.sizeBytes !== size) throw new Error("R2 upload could not be verified");
      return NextResponse.json({ url: `${SITE_URL}/api/mixtape/assets/${body.name}` });
    }
    const { extension, contentType, size } = validateUpload(body);
    const name = `${crypto.randomUUID()}.${extension}`;
    return NextResponse.json({ name, size, contentType, uploadUrl: await getR2PresignedUploadUrl(`mixtape/${name}`, size, contentType) });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 }); }
}
