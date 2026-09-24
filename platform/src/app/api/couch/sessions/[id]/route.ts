import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  assertHost,
  endCouchSession,
  getCouchSession,
  heartbeatHost,
  hostCouchSnapshot,
  publicCouchSnapshot,
  setHostEndpoints,
} from "@/lib/couch/sessionManager";
import { getConnectSettings } from "@/lib/connect/connectSettings";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function withMetricsFlag(
  session: NonNullable<Awaited<ReturnType<typeof getCouchSession>>>,
  isHost = false
) {
  const settings = await getConnectSettings();
  const snap = isHost ? hostCouchSnapshot(session) : publicCouchSnapshot(session);
  return {
    ...snap,
    streamingMetricsEnabled: settings.streamingMetricsEnabled,
  };
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
    const hostToken = url.searchParams.get("hostToken") || "";
    const isHost = Boolean(hostToken && assertHost(session, hostToken));
    if (isHost) {
      await heartbeatHost(session);
    }
    return NextResponse.json(await withMetricsFlag(session, isHost));
  } catch (err) {
    unstable_rethrow(err);
    console.error("GET /api/couch/sessions/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
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
    await heartbeatHost(session);
    if (body.hostEndpoints && typeof body.hostEndpoints === "object") {
      await setHostEndpoints(session, {
        wsUrls: Array.isArray(body.hostEndpoints.wsUrls)
          ? body.hostEndpoints.wsUrls.map(String)
          : [],
        wsToken: String(body.hostEndpoints.wsToken || ""),
      });
    }
    return NextResponse.json(await withMetricsFlag(session, true));
  } catch (err) {
    console.error("PATCH /api/couch/sessions/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { id } = await context.params;
    const session = await getCouchSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const hostToken = String(body.hostToken || url.searchParams.get("hostToken") || "");
    if (!assertHost(session, hostToken)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await endCouchSession(session);
    return NextResponse.json({ ok: true });
  } catch (err) {
    unstable_rethrow(err);
    console.error("DELETE /api/couch/sessions/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
