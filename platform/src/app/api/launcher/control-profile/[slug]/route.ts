import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getTestingProfile, getVerifiedProfile } from "@/lib/controlProfiles/service";

/**
 * GET /api/launcher/control-profile/[slug]?edition=<slug>&preview=1
 *
 * What the launcher's Input Engine fetches at game-launch time to decide
 * whether to offer PlayBound Controls (see `applyControllerConfig` in
 * launcher/main.js). Verified profiles are returned by default. `preview=1`
 * falls back to a testing profile only if no verified one exists; the launcher
 * requires a deliberate Preview choice before activating it. Drafts never
 * leave the admin. `null` means "nothing to activate," not an error.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const edition = new URL(req.url).searchParams.get("edition");
    const verified = await getVerifiedProfile(slug, edition || null);
    const profile = verified || (new URL(req.url).searchParams.get("preview") === "1"
      ? await getTestingProfile(slug, edition || null)
      : null);

    return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    unstable_rethrow(err);
    console.error("Launcher control-profile error:", err);
    return NextResponse.json({ profile: null }, { status: 500 });
  }
}
