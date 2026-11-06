import { NextResponse } from "next/server";
import { controlFeatureSupport, getServerSettingProfile } from "@/lib/serverControl/settings";

/**
 * GET /api/games/:slug/server-controls
 *
 * What a game's server lets a host change, for browsing before there is a
 * server: the overlay's Server tab shows this for any game. Declarations only,
 * with no party, server or player data, so it is public. Defaults and delivery
 * details (rcon commands) stay out; they are not for choosing a game.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getServerSettingProfile(slug);
  if (!profile) return NextResponse.json({ supported: false });
  return NextResponse.json({
    supported: true,
    liveConsole: Boolean(profile.controlChannel),
    mapCount: profile.maps?.options.length ?? 0,
    settings: profile.settings.map((s) => ({ key: s.key, label: s.label, help: s.help ?? null, apply: s.apply })),
    unavailable: controlFeatureSupport(slug).flatMap((f) =>
      f.status === "unavailable" ? [{ label: f.label, reason: f.reason }] : []
    ),
  });
}
