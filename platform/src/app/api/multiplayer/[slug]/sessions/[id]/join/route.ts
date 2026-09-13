import { NextResponse } from "next/server";
import { joinMultiplayerSession } from "@/lib/multiplayer/sessionManager";

interface RouteContext {
  params: Promise<{ slug: string; id: string }>;
}

/**
 * POST /api/multiplayer/:slug/sessions/:id/join
 * Resolves a 6-character room code to session details, STUN/TURN endpoints,
 * and game version validation.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const code = id;
    if (!code) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }

    const joined = await joinMultiplayerSession(code);
    if (!joined) {
      return NextResponse.json(
        { error: "Session not found or expired. Check the room code." },
        { status: 404 }
      );
    }

    const session = joined.session;

    // Verify game slug matches if provided
    if (slug && session.gameSlug !== slug.toLowerCase()) {
      return NextResponse.json(
        { error: `Room code ${code} is for ${session.gameSlug}, not ${slug}.` },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientModVersion = body.modVersion;
    const clientGameVersion = body.gameVersion;

    // Check version compatibility
    const versionMismatch =
      (clientGameVersion && clientGameVersion !== session.gameVersion) ||
      (clientModVersion && session.modVersion && clientModVersion !== session.modVersion);

    return NextResponse.json({
      sessionId: session.sessionId,
      gameSlug: session.gameSlug,
      joinCode: session.joinCode,
      status: session.status,
      gameVersion: session.gameVersion,
      modVersion: session.modVersion,
      playerCount: session.playerCount,
      maxPlayers: session.maxPlayers,
      clientToken: joined.clientToken,
      versionMismatch,
      stunServers: joined.stunServers,
      turnServers: joined.turnServers,
      extraConfig: session.extraConfig,
    });
  } catch (err) {
    console.error("POST /api/multiplayer/[slug]/sessions/[code]/join failed:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
