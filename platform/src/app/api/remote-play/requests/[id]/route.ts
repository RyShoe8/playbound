import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import RemotePlaySession from "@/lib/models/RemotePlaySession";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { patchRemotePlayRequestSchema } from "@/lib/remotePlay/schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ACTIVE_TTL_MS = 2 * 60 * 1000;

/**
 * GET /api/remote-play/requests/[id] — the client device polling its own
 * request for a status change ("requested" → "ready" once the host has
 * launched the game and created a CouchSession, or "declined"/"ended").
 */
export async function GET(req: Request, context: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  await dbConnect();
  const doc = await RemotePlaySession.findOne({ _id: id, userId }).lean();
  if (!doc) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: doc._id.toString(),
    status: doc.status,
    joinUrl: doc.joinUrl,
    gameSlug: doc.gameSlug,
    editionSlug: doc.editionSlug,
    terminationReason: doc.terminationReason,
  });
}

/**
 * PATCH /api/remote-play/requests/[id] — either side advances the handoff:
 * the host sets {status:"ready", joinUrl} once the game is launched and a
 * CouchSession exists, or {status:"declined"} if it can't serve the
 * request; the client can ack {status:"streaming"}; either side can end it.
 * Authorization is account-scoped only (both devices already belong to this
 * userId, enforced at request-creation time) — no separate host/client
 * token, matching how /api/devices itself is account-scoped.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const userId = await getFriendsUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const body = patchRemotePlayRequestSchema.parse(await req.json());
    await dbConnect();

    const update: Record<string, unknown> = { lastHeartbeat: new Date() };
    if (body.status) update.status = body.status;
    if (body.joinUrl) update.joinUrl = body.joinUrl;
    if (body.status === "ended" || body.status === "declined") {
      update.endedAt = new Date();
      if (body.terminationReason) update.terminationReason = body.terminationReason;
      // Let it drop off shortly rather than lingering as a dead row.
      update.expiresAt = new Date(Date.now() + 30 * 1000);
    } else {
      update.expiresAt = new Date(Date.now() + ACTIVE_TTL_MS);
    }

    const doc = await RemotePlaySession.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!doc) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ id: doc._id.toString(), status: doc.status, joinUrl: doc.joinUrl });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    console.error("PATCH /api/remote-play/requests/[id] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
