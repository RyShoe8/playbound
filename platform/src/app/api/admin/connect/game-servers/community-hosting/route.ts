import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CommunityServer from "@/lib/models/CommunityServer";
import CapacityReservation from "@/lib/models/CapacityReservation";
import { hostingSettingsSchema } from "@/lib/communityHosting/settings";
import { fetchGameHostMetrics, listManagedHostRooms } from "@/lib/gameHost/client";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const [config, profiles, servers, reservations, metrics, agent] = await Promise.all([
    CommunityHostingConfig.findOne({ key: "global" }).lean(),
    CommunityServerProfile.find({}).sort({ gameSlug: 1 }).limit(100).lean(),
    CommunityServer.find({}).sort({ updatedAt: -1 }).limit(100).lean(),
    CapacityReservation.find({ state: { $in: ["planned", "active", "missed"] } }).sort({ warmupAt: 1 }).limit(100).lean(),
    fetchGameHostMetrics(), listManagedHostRooms(),
  ]);
  const defaults = new CommunityHostingConfig({ key: "global" }).toObject();
  return NextResponse.json({
    config: config || defaults, profiles, servers, reservations,
    metrics: metrics.ok ? metrics.metrics : null,
    agent: agent.ok ? agent : { ok: false, error: agent.error },
  });
}

export async function PUT(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const parsed = hostingSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid settings" }, { status: 400 });
  await dbConnect();
  const config = await CommunityHostingConfig.findOneAndUpdate(
    { key: "global" },
    { $set: { ...parsed.data, updatedBy: session!.user.id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return NextResponse.json({ ok: true, config });
}
