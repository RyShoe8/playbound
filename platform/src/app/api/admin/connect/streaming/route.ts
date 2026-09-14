import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { getConnectSettings } from "@/lib/connect/connectSettings";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  COUCH_ADMIN_LIVE_MS,
  purgeStaleCouchSessions,
} from "@/lib/couch/sessionManager";
import CouchSessionModel from "@/lib/models/CouchSession";

/**
 * GET /api/admin/connect/streaming — live Couch sessions + latest metrics.
 */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const settings = await getConnectSettings();
    if (!settings.streamingMetricsEnabled) {
      return NextResponse.json({
        settings,
        sessions: [],
        message: "Streaming metrics collection is off.",
      });
    }

    await ensureCouchStore();
    await purgeStaleCouchSessions();
    const now = Date.now();
    const heartbeatCutoff = now - COUCH_ADMIN_LIVE_MS;
    const rows = await CouchSessionModel.find({
      status: "open",
      lastHeartbeat: { $gte: heartbeatCutoff },
    })
      .sort({ lastHeartbeat: -1 })
      .limit(20)
      .lean();

    const sessions = rows.map((s) => ({
      sessionId: s.sessionId,
      joinCode: s.joinCode,
      hostLabel: s.hostLabel,
      maxPlayers: s.maxPlayers,
      reserveHostSlot: Boolean(s.reserveHostSlot),
      createdAt: s.createdAt,
      lastHeartbeat: s.lastHeartbeat,
      ageSec: Math.max(0, Math.round((now - Number(s.createdAt || 0)) / 1000)),
      heartbeatAgeSec: Math.max(0, Math.round((now - Number(s.lastHeartbeat || 0)) / 1000)),
      controllers: (s.controllers || [])
        .filter((c: { status?: string }) => c.status !== "kicked")
        .map((c: {
          controllerId?: string;
          label?: string;
          status?: string;
          playerSlot?: number | null;
        }) => ({
          controllerId: c.controllerId,
          label: c.label,
          status: c.status,
          playerSlot: c.playerSlot ?? null,
        })),
      runtimeMetrics: s.runtimeMetrics || null,
    }));

    return NextResponse.json({ settings, sessions });
  } catch (err) {
    console.error("GET /api/admin/connect/streaming failed:", err);
    return NextResponse.json({ error: "Failed to load streaming sessions" }, { status: 500 });
  }
}
