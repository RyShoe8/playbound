import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import UserHardwareProfile from "@/lib/models/UserHardwareProfile";
import { getFriendsUserId } from "@/lib/friendsAuth";

/**
 * GET /api/hardware/devices — every PC this account has uploaded a hardware
 * snapshot from, for PlayBound Remote's "This PC / Ryan's Gaming PC"
 * comparison on a game page. Deliberately thin: just enough to list and pick
 * a device (id, name, when last seen) — the full spec for the chosen one
 * still comes from `/api/hardware/compatibility?deviceId=...`, which already
 * does the real requirements-matching work.
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  const docs = await UserHardwareProfile.find({ userId })
    .select("deviceId deviceName cpu.displayName gpus primaryGpuIndex updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  const devices = docs.map((doc) => {
    const idx = doc.primaryGpuIndex;
    const primaryGpu =
      idx != null && Array.isArray(doc.gpus) ? doc.gpus[idx] : doc.gpus?.[0];
    return {
      deviceId: doc.deviceId,
      deviceName: doc.deviceName || null,
      cpuDisplay: doc.cpu?.displayName || null,
      gpuDisplay: primaryGpu?.displayName || primaryGpu?.rawName || null,
      updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    };
  });

  return NextResponse.json({ devices });
}
