import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import FlightDeviceProfile from "@/lib/models/FlightDeviceProfile";

/** Approve or reject a submitted flight-device profile. */
export async function PATCH(req: Request, { params }: { params: Promise<{ vidPid: string }> }) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const { vidPid } = await params;
  const key = decodeURIComponent(vidPid).toLowerCase();
  if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = z.object({ status: z.enum(["approved", "rejected", "pending"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "status must be approved, rejected or pending" }, { status: 400 });
  await dbConnect();
  const result = await FlightDeviceProfile.updateOne(
    { vidPid: key },
    { $set: { status: parsed.data.status, reviewedBy: session?.user?.id ?? null, reviewedAt: new Date() } }
  );
  if (!result.matchedCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
