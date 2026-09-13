import { NextResponse } from "next/server";
import { joinSession } from "@/lib/holocure/sessionManager";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/multiplayer/holocure/sessions/:id/join
 * Resolves a 6-character room code or sessionId to session details, STUN/TURN endpoints,
 * and version metadata for pre-flight handshake.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const code = id;
    if (!code) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }

    const joined = await joinSession(code);
    if (!joined) {
      return NextResponse.json(
        { error: "Session not found or expired. Check the room code." },
        { status: 404 }
      );
    }

    const session = joined.session;

    const body = await req.json().catch(() => ({}));
    const clientModVersion = body.modVersion;
    const clientGameVersion = body.gameVersion;

    // Check version compatibility
    const versionMismatch =
      (clientGameVersion && clientGameVersion !== session.gameVersion) ||
      (clientModVersion && clientModVersion !== session.modVersion);

    return NextResponse.json({
      sessionId: session.sessionId,
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
    });
  } catch (err) {
    console.error("POST /api/multiplayer/holocure/sessions/[code]/join failed:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
