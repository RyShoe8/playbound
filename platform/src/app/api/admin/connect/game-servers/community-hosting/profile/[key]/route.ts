import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { profileSettingsSchema, validateProfileReadiness } from "@/lib/communityHosting/profileSettings";

export async function PUT(req: Request, context: { params: Promise<{ key: string }> }) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const { key } = await context.params;
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(key)) return NextResponse.json({ error: "Invalid profile key" }, { status: 400 });
  const parsed = profileSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile settings" }, { status: 400 });
  await dbConnect();
  const current = await CommunityServerProfile.findOne({ key }).lean();
  if (!current) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const reason = validateProfileReadiness(parsed.data, {
    sampleCount: current.sampleCount || 0,
    cpuCores: current.envelope?.cpuCores || 0,
    ramBytes: current.envelope?.ramBytes || 0,
    measuredThroughPlayers: current.envelope?.measuredThroughPlayers || 0,
  });
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  const updated = await CommunityServerProfile.findOneAndUpdate({ key }, { $set: { ...parsed.data, updatedBy: session!.user.id } }, { new: true, runValidators: true });
  return NextResponse.json({ ok: true, profile: updated });
}
