import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import AutomatedEventConfig from "@/lib/models/AutomatedEventConfig";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { DEFAULT_NIGHTLY, normalizeNightly } from "@/lib/events/nightlySchedule";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const [config, games] = await Promise.all([
    AutomatedEventConfig.findOne({ key: "global" }).select({ nightly: 1 }).lean(),
    CatalogGame.find({ status: "published", published: true, playboundSupported: true, features: { $in: ["Multiplayer", "Co-op"] } })
      .select({ slug: 1, title: 1 }).sort({ title: 1 }).lean(),
  ]);
  const editions = await Edition.find({
    gameSlug: { $in: games.map((g) => g.slug) },
    status: { $ne: "archived" }, visibility: { $ne: "hidden" },
  }).select({ gameSlug: 1, slug: 1, name: 1 }).lean();
  return NextResponse.json({
    nightly: config?.nightly || DEFAULT_NIGHTLY,
    candidates: games.map((g) => ({
      slug: g.slug, title: g.title,
      editions: editions.filter((e) => e.gameSlug === g.slug).map((e) => ({ slug: e.slug, name: e.name })),
    })),
  });
}

export async function PUT(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  let nightly;
  try {
    nightly = normalizeNightly(body);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid schedule" }, { status: 400 });
  }
  await dbConnect();
  const selected = nightly.games.filter((g) => g.enabled);
  const [games, editions] = await Promise.all([
    CatalogGame.find({ slug: { $in: selected.map((g) => g.slug) }, status: "published", published: true, playboundSupported: true, features: { $in: ["Multiplayer", "Co-op"] } }).select({ slug: 1 }).lean(),
    Edition.find({ gameSlug: { $in: selected.map((g) => g.slug) }, status: { $ne: "archived" }, visibility: { $ne: "hidden" } }).select({ gameSlug: 1, slug: 1 }).lean(),
  ]);
  const allowedGames = new Set(games.map((g) => g.slug));
  const allowedEditions = new Set(editions.map((e) => `${e.gameSlug}:${e.slug}`));
  if (selected.some((g) => !allowedGames.has(g.slug) || (g.editionSlug && !allowedEditions.has(`${g.slug}:${g.editionSlug}`)))) {
    return NextResponse.json({ error: "Select published multiplayer games and valid editions" }, { status: 400 });
  }
  // The legacy pop-up planner is removed; its `enabled` flag is cleared so
  // stored data cannot suggest it still runs.
  await AutomatedEventConfig.findOneAndUpdate(
    { key: "global" },
    { $set: { nightly, enabled: false } },
    { upsert: true, new: true, runValidators: true }
  );
  return NextResponse.json({ ok: true, nightly });
}
