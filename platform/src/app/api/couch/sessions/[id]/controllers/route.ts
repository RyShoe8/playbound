import { NextResponse } from "next/server";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  assertHost,
  approveController,
  getCouchSession,
  publicCouchSnapshot,
  reassignSlot,
  rejectOrKickController,
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
    if (!assertHost(session, String(body.hostToken || ""))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const action = String(body.action || "");
    const controllerId = String(body.controllerId || "");
    if (!controllerId) {
      return NextResponse.json({ error: "controllerId required." }, { status: 400 });
    }

    if (action === "approve") {
      const result = await approveController(session, controllerId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        controller: result,
        snapshot: publicCouchSnapshot(session),
      });
    }

    if (action === "reject" || action === "kick") {
      const ok = await rejectOrKickController(session, controllerId);
      if (!ok) {
        return NextResponse.json({ error: "Controller not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, snapshot: publicCouchSnapshot(session) });
    }

    if (action === "reassign") {
      const slot = Number(body.playerSlot);
      const result = await reassignSlot(session, controllerId, slot);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        controller: result,
        snapshot: publicCouchSnapshot(session),
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/couch/sessions/[id]/controllers failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
