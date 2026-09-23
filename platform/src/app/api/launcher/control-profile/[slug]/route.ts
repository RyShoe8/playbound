import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getVerifiedProfile } from "@/lib/controlProfiles/service";

/**
 * GET /api/launcher/control-profile/[slug]?edition=<slug>
 *
 * What the launcher's Input Engine fetches at game-launch time to decide
 * whether to activate PlayBound Controls (see `applyControllerConfig` in
 * launcher/main.js). Only ever returns a `status: "verified"` profile —
 * draft/testing rows are admin-preview-only and never reach a real player
 * through this route. `null` means "nothing to activate," not an error; the
 * launcher's existing per-game config-file path is the fallback either way.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const edition = new URL(req.url).searchParams.get("edition");
    const profile = await getVerifiedProfile(slug, edition || null);

    return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    unstable_rethrow(err);
    console.error("Launcher control-profile error:", err);
    return NextResponse.json({ profile: null }, { status: 500 });
  }
}
