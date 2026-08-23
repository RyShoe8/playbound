import { NextResponse } from "next/server";
import { getSessionByCode } from "@/lib/holocure/sessionManager";

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

    const session = getSessionByCode(code) || (getSessionById(code) ? getSessionById(code) : undefined);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found or expired. Check the room code." },
        { status: 404 }
      );
    }

    if (session.status === "ended") {
      return NextResponse.json(
        { error: "This game session has ended." },
        { status: 410 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientModVersion = body.modVersion;
    const clientGameVersion = body.gameVersion;

    // Check version compatibility
    const versionMismatch =
      (clientGameVersion && clientGameVersion !== session.gameVersion) ||
      (clientModVersion && clientModVersion !== session.modVersion);

    const vpsIp = process.env.GAME_HOST_PUBLIC_IP || "127.0.0.1";
    const stunPort = process.env.STUN_PORT || "3478";

    return NextResponse.json({
      sessionId: session.sessionId,
      joinCode: session.joinCode,
      status: session.status,
      gameVersion: session.gameVersion,
      modVersion: session.modVersion,
      playerCount: session.playerCount,
      maxPlayers: session.maxPlayers,
      versionMismatch,
      stunServers: [`stun:${vpsIp}:${stunPort}`, "stun:stun.l.google.com:19302"],
      turnServers: [
        {
          urls: `turn:${vpsIp}:${stunPort}`,
          username: "playbound_guest",
          credential: "guest_session_token",
        },
      ],
    });
  } catch (err) {
    console.error("POST /api/multiplayer/holocure/sessions/[code]/join failed:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
