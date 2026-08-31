import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  postSignalingMessage,
  pollSignalingMessages,
} from "@/lib/holocure/sessionManager";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/multiplayer/holocure/sessions/:id/signal
 * Pushes a new signaling message (e.g. GNS P2P offer, answer, ICE candidate blob).
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { senderRole, recipientRole, senderPeerId, payload } = body;

    if (!senderRole || !recipientRole || !payload) {
      return NextResponse.json(
        { error: "Invalid signaling payload. Required: senderRole, recipientRole, payload." },
        { status: 400 }
      );
    }

    const message = postSignalingMessage(sessionId, {
      senderRole,
      recipientRole,
      senderPeerId: senderPeerId || "anonymous",
      payload,
    });

    if (!message) {
      return NextResponse.json(
        { error: "Session not found or inactive." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, messageId: message.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/multiplayer/holocure/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/multiplayer/holocure/sessions/:id/signal?forRole=host&since=123456789
 * Polls for incoming signaling messages destined for a specific role.
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const url = new URL(req.url);
    const forRole = url.searchParams.get("forRole");
    const since = parseInt(url.searchParams.get("since") || "0", 10);

    if (forRole !== "host" && forRole !== "client") {
      return NextResponse.json(
        { error: "Invalid or missing forRole query param ('host' | 'client')." },
        { status: 400 }
      );
    }

    const messages = pollSignalingMessages(
      sessionId,
      forRole as "host" | "client",
      since
    );

    return NextResponse.json({ messages });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("GET /api/multiplayer/holocure/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
