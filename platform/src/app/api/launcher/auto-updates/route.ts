import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import dbConnect from "@/lib/db";
import PlatformLimits from "@/lib/models/PlatformLimits";

/**
 * The remote off switch for the launcher's automatic updates. Launchers skip
 * updating unless this answers, so a failed read also stops them.
 */
export async function GET() {
  try {
    await dbConnect();
    const limits = await PlatformLimits.findOne({ singletonKey: "default" })
      .select("launcherAutoUpdates")
      .lean();
    return NextResponse.json(
      { enabled: limits?.launcherAutoUpdates !== false },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } }
    );
  } catch (err) {
    unstable_rethrow(err);
    console.error("Auto-update switch read error:", err);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
