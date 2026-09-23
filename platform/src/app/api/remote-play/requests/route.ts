import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Device from "@/lib/models/Device";
import RemotePlaySession from "@/lib/models/RemotePlaySession";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createRemotePlayRequestSchema } from "@/lib/remotePlay/schema";

/**
 * A "requested" row that hasn't been picked up by the host's poll yet must
 * still disappear if the host never comes online — same TTL contract as
 * CouchSession/MultiplayerSession. Once a host acknowledges it (status
 * "ready"/"streaming"), PATCH slides this forward so an active stream never
 * expires mid-session.
 */
const PENDING_TTL_MS = 2 * 60 * 1000;

/**
 * POST /api/remote-play/requests — a client device (game detail page's
 * "Play Remotely") asks a host device, on the same account, to launch a
 * game and hand back a CouchSession join URL. The host device's launcher
 * long-polls GET below for rows addressed to it.
 */
export async function POST(req: Request) {
  try {
    const userId = await getFriendsUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = createRemotePlayRequestSchema.parse(await req.json());
    await dbConnect();

    const host = await Device.findOne({ userId, deviceId: body.hostDeviceId }).select("_id").lean();
    if (!host) {
      return NextResponse.json({ error: "Host device not registered to this account" }, { status: 404 });
    }

    const doc = await RemotePlaySession.create({
      userId,
      hostDeviceId: body.hostDeviceId,
      clientDeviceId: body.clientDeviceId,
      gameSlug: body.gameSlug,
      editionSlug: body.editionSlug ?? null,
      status: "requested",
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });

    return NextResponse.json({ id: doc._id.toString(), status: doc.status }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    console.error("POST /api/remote-play/requests failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/remote-play/requests?forDevice=<hostDeviceId> — a host device
 * polling for pending requests addressed to it. Scoped to `userId` from the
 * session, so a device can only ever see requests naming one of ITS OWN
 * account's devices as the host — this is the whole authorization boundary,
 * no separate device-pairing/trust step needed.
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forDevice = new URL(req.url).searchParams.get("forDevice")?.trim();
  if (!forDevice) {
    return NextResponse.json({ error: "forDevice required" }, { status: 400 });
  }
  await dbConnect();
  const docs = await RemotePlaySession.find({ userId, hostDeviceId: forDevice, status: "requested" })
    .sort({ startedAt: 1 })
    .lean();
  return NextResponse.json({
    requests: docs.map((d) => ({
      id: d._id.toString(),
      clientDeviceId: d.clientDeviceId,
      gameSlug: d.gameSlug,
      editionSlug: d.editionSlug,
      startedAt: d.startedAt?.toISOString?.() ?? null,
    })),
  });
}
