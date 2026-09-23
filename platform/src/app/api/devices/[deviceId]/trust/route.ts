import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Device from "@/lib/models/Device";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { trustDeviceSchema } from "@/lib/devices/schema";

/**
 * Trust is a relationship between two devices on one account, recorded on
 * the *host*'s own `Device.trustedDevices` — mirrors `CouchSession`'s
 * approve pattern, except the actual "Allow this device?" prompt happens
 * live in the launcher over a direct LAN connection (see
 * `launcher/services/remotePlay/pairing.js`), not through this API. This
 * route only persists the outcome once a human has clicked Allow, so a
 * pairing survives a reinstall and future connections need no re-approval.
 */

/** POST — the host (named by the [deviceId] segment) trusts another device (in the body). */
export async function POST(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const userId = await getFriendsUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { deviceId: hostDeviceId } = await params;
    const body = trustDeviceSchema.parse(await req.json());
    await dbConnect();

    const host = await Device.findOne({ userId, deviceId: hostDeviceId });
    if (!host) return NextResponse.json({ error: "Host device not registered" }, { status: 404 });

    const already = host.trustedDevices.find((t: { deviceId: string }) => t.deviceId === body.deviceId);
    if (already) {
      already.name = body.name;
      already.lastUsedAt = new Date();
    } else {
      host.trustedDevices.push({ deviceId: body.deviceId, name: body.name, trustedAt: new Date() });
    }
    await host.save();

    return NextResponse.json({ success: true, trustedDevices: host.trustedDevices });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid device" }, { status: 400 });
    }
    console.error("Device trust error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** GET — list this host's trusted devices, for Settings → Remote Play Devices. */
export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { deviceId: hostDeviceId } = await params;
  await dbConnect();
  const host = await Device.findOne({ userId, deviceId: hostDeviceId }).select("trustedDevices").lean();
  if (!host) return NextResponse.json({ error: "Host device not registered" }, { status: 404 });
  return NextResponse.json({ trustedDevices: host.trustedDevices || [] });
}

/** DELETE — revoke a trusted device (?clientDeviceId=). */
export async function DELETE(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { deviceId: hostDeviceId } = await params;
  const clientDeviceId = new URL(req.url).searchParams.get("clientDeviceId")?.trim();
  if (!clientDeviceId) {
    return NextResponse.json({ error: "clientDeviceId required" }, { status: 400 });
  }
  await dbConnect();
  await Device.updateOne(
    { userId, deviceId: hostDeviceId },
    { $pull: { trustedDevices: { deviceId: clientDeviceId } } }
  );
  return NextResponse.json({ success: true });
}
