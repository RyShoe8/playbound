import { NextResponse } from "next/server";
import {
  updateSessionStatus,
  deleteMultiplayerSession,
} from "@/lib/multiplayer/sessionManager";

interface RouteContext {
  params: Promise<{ slug: string; id: string }>;
}

/**
 * POST /api/multiplayer/:slug/sessions/:id/heartbeat
 * Keepalive ping to maintain session freshness and update player count/status.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { playerCount, status } = body;

    const ok = updateSessionStatus(sessionId, playerCount, status);
    if (!ok) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/multiplayer/[slug]/sessions/[id]/heartbeat failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/multiplayer/:slug/sessions/:id/heartbeat
 * Host ends and cleans up session.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const ok = deleteMultiplayerSession(sessionId, token || undefined);
    if (!ok) {
      return NextResponse.json(
        { error: "Unauthorized or session does not exist" },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/multiplayer/[slug]/sessions/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
