import { NextResponse } from "next/server";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  assertController,
  assertHost,
  getCouchSession,
  pollCouchSignals,
  postCouchSignal,
} from "@/lib/couch/sessionManager";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { id } = await context.params;
    const session = await getCouchSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const senderRole = body.senderRole === "host" ? "host" : "controller";
    const recipientRole = body.recipientRole === "host" ? "host" : "controller";
    const senderPeerId = String(body.senderPeerId || "");
    const payload = String(body.payload || "");

    if (!payload) {
      return NextResponse.json({ error: "payload required." }, { status: 400 });
    }

    if (senderRole === "host") {
      if (!assertHost(session, String(body.hostToken || ""))) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    } else {
      const c = assertController(
        session,
        String(body.controllerId || ""),
        String(body.controllerToken || "")
      );
      if (!c || c.status === "kicked") {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    const message = await postCouchSignal(session, {
      senderRole,
      recipientRole,
      senderPeerId,
      payload,
    });
    if (!message) {
      return NextResponse.json({ error: "Session inactive." }, { status: 410 });
    }
    return NextResponse.json({ success: true, messageId: message.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/couch/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { id } = await context.params;
    const session = await getCouchSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const url = new URL(req.url);
    const forRole = url.searchParams.get("forRole");
    const since = parseInt(url.searchParams.get("since") || "0", 10);

    if (forRole !== "host" && forRole !== "controller") {
      return NextResponse.json({ error: "forRole must be host or controller." }, { status: 400 });
    }

    if (forRole === "host") {
      const hostToken = url.searchParams.get("hostToken") || "";
      if (!assertHost(session, hostToken)) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    } else {
      const c = assertController(
        session,
        url.searchParams.get("controllerId") || "",
        url.searchParams.get("controllerToken") || ""
      );
      if (!c) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    const messages = pollCouchSignals(session, forRole, since);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("GET /api/couch/sessions/[id]/signal failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
