import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  postSessionSignal,
  pollSessionSignals,
} from "@/lib/multiplayer/sessionManager";

interface RouteContext {
  params: Promise<{ slug: string; id: string }>;
}

/**
 * POST /api/multiplayer/:slug/sessions/:id/signal
 * Pushes a new signaling message (SDP/ICE candidate blob).
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const body = await req.json().catch(() => ({}));
    const { senderRole, recipientRole, senderPeerId, payload } = body;

    if (
      !token ||
      !["host", "client"].includes(senderRole) ||
      !["host", "client"].includes(recipientRole) ||
      typeof payload !== "string" ||
      !payload
    ) {
      return NextResponse.json(
        { error: "Invalid signaling payload. Required: senderRole, recipientRole, payload." },
        { status: 400 }
      );
    }

    const message = await postSessionSignal(sessionId, token, {
      senderRole,
      recipientRole,
      senderPeerId: senderPeerId || "anonymous",
      payload,
    });

    if (!message) {
      return NextResponse.json(
        { error: "Invalid session capability." },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, messageId: message.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/multiplayer/[slug]/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/multiplayer/:slug/sessions/:id/signal?forRole=host&since=123456789
 * Polls for incoming signaling messages destined for a specific role.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const url = new URL(req.url);
    const forRole = url.searchParams.get("forRole");
    const since = parseInt(url.searchParams.get("since") || "0", 10);

    if (!token || (forRole !== "host" && forRole !== "client")) {
      return NextResponse.json(
        { error: "Invalid or missing forRole query param ('host' | 'client')." },
        { status: 400 }
      );
    }

    const messages = await pollSessionSignals(
      sessionId,
      token,
      forRole as "host" | "client",
      since
    );
    if (!messages) {
      return NextResponse.json({ error: "Invalid session capability." }, { status: 401 });
    }

    return NextResponse.json({ messages });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("GET /api/multiplayer/[slug]/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
