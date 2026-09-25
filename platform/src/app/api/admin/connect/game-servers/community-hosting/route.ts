import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CommunityServer from "@/lib/models/CommunityServer";
import CapacityReservation from "@/lib/models/CapacityReservation";
import { hostingSettingsSchema } from "@/lib/communityHosting/settings";
import { fetchGameHostMetrics, listManagedHostRooms } from "@/lib/gameHost/client";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";

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
  // Display names for the game/edition checklist; profiles store slugs only.
  const gameSlugs = [...new Set(profiles.map((p) => p.gameSlug))];
  const [titleRows, editionRows] = await Promise.all([
    CatalogGame.find({ slug: { $in: gameSlugs } }).select({ slug: 1, title: 1 }).lean(),
    Edition.find({ gameSlug: { $in: gameSlugs } }).select({ gameSlug: 1, slug: 1, name: 1 }).lean(),
  ]);
  const titles = Object.fromEntries(titleRows.map((g) => [g.slug, g.title]));
  const editionNames = Object.fromEntries(editionRows.map((e) => [`${e.gameSlug}:${e.slug}`, e.name]));
  return NextResponse.json({
    config: config || defaults, profiles, servers, reservations, titles, editionNames,
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
