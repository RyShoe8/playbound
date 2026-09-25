import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import AutomatedEventConfig from "@/lib/models/AutomatedEventConfig";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { DEFAULT_NIGHTLY, normalizeNightly } from "@/lib/events/nightlySchedule";
import { supportsMultiplayer } from "@/lib/multiplayer/support";
import { games as seedGames } from "@/lib/data/games";
import { editions as seedEditions } from "@/lib/data/editions";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const [config, dbGames] = await Promise.all([
    AutomatedEventConfig.findOne({ key: "global" }).select({ nightly: 1 }).lean(),
    CatalogGame.find({
      status: { $ne: "draft" },
      published: { $ne: false },
      playboundSupported: { $ne: false },
    })
      .select({ slug: 1, title: 1, features: 1, tags: 1, launchMethods: 1, multiplayer: 1 })
      .lean(),
  ]);

  const gameMap = new Map<string, { slug: string; title: string }>();
  for (const g of seedGames) {
    if (g.status !== "draft" && supportsMultiplayer(g)) {
      gameMap.set(g.slug, { slug: g.slug, title: g.title });
    }
  }
  for (const g of (dbGames || [])) {
    if (supportsMultiplayer(g)) {
      gameMap.set(g.slug, { slug: g.slug, title: g.title });
    }
  }

  const candidateGames = Array.from(gameMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const candidateSlugs = candidateGames.map((g) => g.slug);
  const candidateSlugSet = new Set(candidateSlugs);

  const dbEditions = await Edition.find({
    gameSlug: { $in: candidateSlugs },
    status: { $ne: "archived" },
    visibility: { $ne: "hidden" },
  })
    .select({ gameSlug: 1, slug: 1, name: 1 })
    .lean();

  const editionMap = new Map<string, { gameSlug: string; slug: string; name: string }>();
  for (const e of seedEditions) {
    if (e.gameSlug && candidateSlugSet.has(e.gameSlug)) {
      editionMap.set(`${e.gameSlug}:${e.slug}`, { gameSlug: e.gameSlug, slug: e.slug, name: e.name });
    }
  }
  for (const e of (dbEditions || [])) {
    editionMap.set(`${e.gameSlug}:${e.slug}`, { gameSlug: e.gameSlug, slug: e.slug, name: e.name });
  }

  const allEditions = Array.from(editionMap.values());

  return NextResponse.json({
    nightly: config?.nightly || DEFAULT_NIGHTLY,
    candidates: candidateGames.map((g) => ({
      slug: g.slug,
      title: g.title,
      editions: allEditions
        .filter((e) => e.gameSlug === g.slug)
        .map((e) => ({ slug: e.slug, name: e.name })),
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
  const [dbGames, dbEditions] = await Promise.all([
    CatalogGame.find({
      slug: { $in: selected.map((g) => g.slug) },
      status: { $ne: "draft" },
      published: { $ne: false },
      playboundSupported: { $ne: false },
    })
      .select({ slug: 1, features: 1, tags: 1, launchMethods: 1, multiplayer: 1 })
      .lean(),
    Edition.find({
      gameSlug: { $in: selected.map((g) => g.slug) },
      status: { $ne: "archived" },
      visibility: { $ne: "hidden" },
    })
      .select({ gameSlug: 1, slug: 1 })
      .lean(),
  ]);

  const allowedGames = new Set<string>();
  for (const g of seedGames) {
    if (g.status !== "draft" && supportsMultiplayer(g)) {
      allowedGames.add(g.slug);
    }
  }
  for (const g of (dbGames || [])) {
    if (supportsMultiplayer(g)) {
      allowedGames.add(g.slug);
    }
  }

  const allowedEditions = new Set<string>();
  for (const e of seedEditions) {
    if (e.gameSlug) allowedEditions.add(`${e.gameSlug}:${e.slug}`);
  }
  for (const e of (dbEditions || [])) {
    allowedEditions.add(`${e.gameSlug}:${e.slug}`);
  }

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
