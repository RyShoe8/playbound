import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Device from "@/lib/models/Device";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { registerDeviceSchema } from "@/lib/devices/schema";

/**
 * GET /api/devices — every PC registered to this account, for PlayBound
 * Remote's device picker and the "Ryan's Gaming PC is available" checks a
 * client makes before offering "Play Remotely".
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  const docs = await Device.find({ userId })
    .select("deviceId name platform lastSeenAt capabilities lanAddresses hostPort")
    .lean();
  return NextResponse.json({
    devices: docs.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      platform: d.platform,
      lastSeenAt: d.lastSeenAt?.toISOString?.() ?? null,
      capabilities: d.capabilities || {},
      lanAddresses: d.lanAddresses || [],
      hostPort: d.hostPort || null,
    })),
  });
}

/**
 * POST /api/devices — a PlayBound launcher registers/updates itself as a
 * known device on this account. Called on startup and whenever Remote Play
 * is enabled/disabled or a capability changes (e.g. hardware-encoder probe
 * result). Upsert, keyed `{userId, deviceId}` — never creates a second row
 * for the same physical PC.
 */
export async function POST(req: Request) {
  try {
    const userId = await getFriendsUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = registerDeviceSchema.parse(await req.json());
    await dbConnect();

    const doc = await Device.findOneAndUpdate(
      { userId, deviceId: body.deviceId },
      {
        $set: {
          name: body.name,
          lastSeenAt: new Date(),
          ...(body.capabilities ? { capabilities: body.capabilities } : {}),
          ...(body.lanAddresses ? { lanAddresses: body.lanAddresses } : {}),
          ...(body.hostPort !== undefined ? { hostPort: body.hostPort } : {}),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return NextResponse.json({ success: true, deviceId: doc.deviceId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid device" }, { status: 400 });
    }
    console.error("Device register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
