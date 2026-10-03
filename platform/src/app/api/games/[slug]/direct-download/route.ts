import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { directGameDownload } from "@/lib/directGameDownload";
import { directPurchaseRequired } from "@/lib/access/resolver";
import { manualDownloadSource } from "@/lib/mirrors/manualDownloadSource";
import type { LauncherOs } from "@/lib/launcherDownload";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game || directPurchaseRequired(game.access)) {
    return NextResponse.json({ error: "Free game not found" }, { status: 404 });
  }
  const requestedOs = new URL(req.url).searchParams.get("os");
  const os: LauncherOs = requestedOs === "macos" || requestedOs === "linux" ? requestedOs : "windows";
  const result = await directGameDownload(game.launcherInstall, os, game.website);
  return NextResponse.json({
    ...result,
    sourceType: result.direct ? manualDownloadSource(result.url, process.env.R2_CUSTOM_DOMAIN) : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
