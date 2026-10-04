import { NextResponse } from "next/server";
import { getR2PresignedDownloadUrl, r2HotcacheConfigured } from "@/lib/mirrors/r2Client";
import { validAssetName } from "@/lib/mixtape/storage";
/** Stable URLs preserve the game cache when signed R2 URLs expire. */
export async function GET(_req: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!validAssetName(name)) return NextResponse.json({ error: "Invalid music object" }, { status: 404 });
  if (!r2HotcacheConfigured()) return NextResponse.json({ error: "Music storage unavailable" }, { status: 503 });
  return NextResponse.redirect(await getR2PresignedDownloadUrl(`mixtape/${name}`, 3600), { status: 307, headers: { "Cache-Control": "no-store" } });
}
