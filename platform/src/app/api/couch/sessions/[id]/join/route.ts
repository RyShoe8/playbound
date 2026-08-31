import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  assertController,
  getCouchSession,
  getCouchSessionByCode,
  joinCouchSession,
  publicCouchSnapshot,
} from "@/lib/couch/sessionManager";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { id } = await context.params;
    let session = await getCouchSession(id);
    if (!session) session = await getCouchSessionByCode(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await joinCouchSession(session, {
      label: typeof body.label === "string" ? body.label : undefined,
      profile: typeof body.profile === "string" ? body.profile : undefined,
      deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel : undefined,
      controllerId: typeof body.controllerId === "string" ? body.controllerId : undefined,
      controllerToken:
        typeof body.controllerToken === "string" ? body.controllerToken : undefined,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { controller, reconnect } = result;
    // Reload after save for fresh endpoints
    session = (await getCouchSession(session.sessionId)) || session;
    const snap = publicCouchSnapshot(session);

    return NextResponse.json({
      reconnect,
      controllerId: controller.controllerId,
      controllerToken: controller.controllerToken,
      sessionToken: controller.sessionToken,
      playerSlot: controller.playerSlot,
      status: controller.status,
      sessionId: session.sessionId,
      joinCode: session.joinCode,
      hostLabel: session.hostLabel,
      snapshot: snap,
      wsToken:
        controller.status === "approved" && session.hostEndpoints
          ? session.hostEndpoints.wsToken
          : null,
      wsUrls:
        controller.status === "approved" && session.hostEndpoints
          ? session.hostEndpoints.wsUrls
          : [],
      iceServers: snap.hostEndpoints?.iceServers || [],
    });
  } catch (err) {
    console.error("POST /api/couch/sessions/[id]/join failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { id } = await context.params;
    let session = await getCouchSession(id);
    if (!session) session = await getCouchSessionByCode(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const url = new URL(req.url);
    const controllerId = url.searchParams.get("controllerId") || "";
    const controllerToken = url.searchParams.get("controllerToken") || "";
    const c = assertController(session, controllerId, controllerToken);
    if (!c) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    c.lastSeen = Date.now();
    const { heartbeatHost } = await import("@/lib/couch/sessionManager");
    await heartbeatHost(session);
    session = (await getCouchSession(session.sessionId)) || session;
    const snap = publicCouchSnapshot(session);
    return NextResponse.json({
      status: c.status,
      playerSlot: c.playerSlot,
      sessionToken: c.sessionToken,
      snapshot: snap,
      wsToken:
        c.status === "approved" && session.hostEndpoints
          ? session.hostEndpoints.wsToken
          : null,
      wsUrls:
        c.status === "approved" && session.hostEndpoints
          ? session.hostEndpoints.wsUrls
          : [],
    });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("GET /api/couch/sessions/[id]/join failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
