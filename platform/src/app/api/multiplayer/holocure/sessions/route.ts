import { NextResponse } from "next/server";
import { createSession } from "@/lib/holocure/sessionManager";

/**
 * POST /api/multiplayer/holocure/sessions
 * Creates a new HoloCure multiplayer session. Returns 6-character join code,
 * host auth token, and STUN/TURN server endpoints.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { gameVersion, modVersion, packageHash, maxPlayers } = body;

    const result = createSession({
      gameVersion: typeof gameVersion === "string" ? gameVersion : "0.7.x",
      modVersion: typeof modVersion === "string" ? modVersion : "1.0.0-playbound",
      packageHash: typeof packageHash === "string" ? packageHash : undefined,
      maxPlayers: typeof maxPlayers === "number" ? maxPlayers : 4,
    });

    return NextResponse.json(
      {
        sessionId: result.session.sessionId,
        joinCode: result.session.joinCode,
        hostToken: result.session.hostToken,
        gameVersion: result.session.gameVersion,
        modVersion: result.session.modVersion,
        maxPlayers: result.session.maxPlayers,
        stunServers: result.stunServers,
        turnServers: result.turnServers,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/multiplayer/holocure/sessions failed:", err);
    return NextResponse.json(
      { error: "Failed to create multiplayer session" },
      { status: 500 }
    );
  }
}
