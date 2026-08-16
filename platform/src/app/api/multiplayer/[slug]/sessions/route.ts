import { NextResponse } from "next/server";
import { createMultiplayerSession } from "@/lib/multiplayer/sessionManager";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/multiplayer/:slug/sessions
 * Generic multiplayer session creation for any supported game title.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { gameVersion, modVersion, packageHash, maxPlayers, extraConfig } = body;

    const result = createMultiplayerSession({
      gameSlug: slug,
      gameVersion: typeof gameVersion === "string" ? gameVersion : "1.0",
      modVersion: typeof modVersion === "string" ? modVersion : undefined,
      packageHash: typeof packageHash === "string" ? packageHash : undefined,
      maxPlayers: typeof maxPlayers === "number" ? maxPlayers : 4,
      extraConfig: typeof extraConfig === "object" ? extraConfig : undefined,
    });

    return NextResponse.json(
      {
        sessionId: result.session.sessionId,
        gameSlug: result.session.gameSlug,
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
    console.error("POST /api/multiplayer/[slug]/sessions failed:", err);
    return NextResponse.json(
      { error: "Failed to create multiplayer session" },
      { status: 500 }
    );
  }
}
