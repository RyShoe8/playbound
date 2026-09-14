import { NextResponse } from "next/server";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  assertHost,
  getCouchSession,
  setRuntimeMetrics,
} from "@/lib/couch/sessionManager";
import { getConnectSettings } from "@/lib/connect/connectSettings";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/couch/sessions/[id]/metrics — host uploads pad/stream metrics.
 * Only accepted when Admin has streaming metrics collection enabled.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const settings = await getConnectSettings();
    if (!settings.streamingMetricsEnabled) {
      return NextResponse.json(
        { error: "Streaming metrics collection is off.", enabled: false },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const session = await getCouchSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    if (!assertHost(session, String(body.hostToken || ""))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const controllers = Array.isArray(body.controllers) ? body.controllers : [];
    const metrics = {
      joinCode: session.joinCode,
      hostLabel: session.hostLabel,
      reserveHostSlot: Boolean(session.reserveHostSlot),
      controllers: controllers.slice(0, 8).map((c: Record<string, unknown>) => ({
        controllerId: String(c.controllerId || "").slice(0, 80),
        playerSlot: typeof c.playerSlot === "number" ? c.playerSlot : null,
        status: String(c.status || "").slice(0, 32),
        transport: String(c.transport || "unknown").slice(0, 32),
        pingMs: typeof c.pingMs === "number" ? c.pingMs : null,
        jitterMs: typeof c.jitterMs === "number" ? c.jitterMs : null,
        hz: typeof c.hz === "number" ? c.hz : 0,
        packets: typeof c.packets === "number" ? c.packets : 0,
        packetLoss: typeof c.packetLoss === "number" ? c.packetLoss : 0,
      })),
      collectedAt: typeof body.collectedAt === "string" ? body.collectedAt : new Date().toISOString(),
    };

    await setRuntimeMetrics(session, metrics);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/couch/sessions/[id]/metrics failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
