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
import { HOSTABLE_SLUGS, HOSTABLE_GAMES } from "@/lib/gameHost/catalog";
import { editions as seedEditions } from "@/lib/data/editions";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const [config, profiles, servers, reservations, metrics, agent] = await Promise.all([
    CommunityHostingConfig.findOne({ key: "global" }).lean(),
    CommunityServerProfile.find({}).sort({ gameSlug: 1 }).lean(),
    CommunityServer.find({
      $or: [
        { desiredState: "running" },
        { runtimeState: { $in: ["running", "pending"] } },
      ],
    }).sort({ updatedAt: -1 }).limit(50).lean(),
    CapacityReservation.find({ state: { $in: ["planned", "active", "missed"] } }).sort({ warmupAt: 1 }).limit(100).lean(),
    fetchGameHostMetrics(), listManagedHostRooms(),
  ]);
  const defaults = new CommunityHostingConfig({ key: "global" }).toObject();
  // Display names for the game/edition checklist; include all hostable catalog games.
  const gameSlugs = [...new Set([...profiles.map((p) => p.gameSlug), ...HOSTABLE_SLUGS])];
  const [titleRows, editionRows] = await Promise.all([
    CatalogGame.find({ slug: { $in: gameSlugs } }).select({ slug: 1, title: 1 }).lean(),
    Edition.find({
      gameSlug: { $in: gameSlugs },
      status: { $ne: "archived" },
      visibility: { $ne: "hidden" },
    }).select({ gameSlug: 1, slug: 1, name: 1, suppressesSeed: 1 }).lean(),
  ]);

  const titles: Record<string, string> = Object.fromEntries(titleRows.map((g) => [g.slug, g.title]));
  for (const slug of gameSlugs) {
    if (!titles[slug] && HOSTABLE_GAMES[slug]?.title) {
      titles[slug] = HOSTABLE_GAMES[slug].title;
    }
  }

  const suppressedSeedSlugs = new Set(
    editionRows.filter((e) => (e as unknown as { suppressesSeed?: boolean }).suppressesSeed).map((e) => `${e.gameSlug}:${e.slug}`)
  );
  const allEditionsMap = new Map<string, { gameSlug: string; slug: string; name: string }>();
  for (const e of editionRows) {
    if (!(e as unknown as { suppressesSeed?: boolean }).suppressesSeed) {
      allEditionsMap.set(`${e.gameSlug}:${e.slug}`, { gameSlug: e.gameSlug, slug: e.slug, name: e.name });
    }
  }
  for (const s of seedEditions) {
    if (gameSlugs.includes(s.gameSlug) && s.status !== "archived" && s.visibility !== "hidden") {
      const k = `${s.gameSlug}:${s.slug}`;
      if (!allEditionsMap.has(k) && !suppressedSeedSlugs.has(k)) {
        allEditionsMap.set(k, { gameSlug: s.gameSlug, slug: s.slug, name: s.name });
      }
    }
  }
  const editionNames = Object.fromEntries([...allEditionsMap.values()].map((e) => [`${e.gameSlug}:${e.slug}`, e.name]));

  // Index existing profiles by unique key
  const existingByKey = new Map(profiles.map((p) => [p.key, p]));
  const finalProfilesMap = new Map<string, unknown>();

  for (const slug of gameSlugs) {
    const baseKey = `${slug}:base`;
    let baseProfile = existingByKey.get(baseKey) || profiles.find((p) => p.gameSlug === slug && (p.editionSlug === null || p.editionSlug === undefined));
    if (!baseProfile) {
      baseProfile = {
        key: baseKey,
        gameSlug: slug,
        editionSlug: null,
        recipeSlug: slug,
        verification: "testing",
        blockedReason: null,
        queryKind: "none",
        queryVerified: false,
        joinVerified: false,
        enabled: false,
        rotationEligible: false,
        weight: 1,
        minimumOnlineMinutes: null,
        idleMinutes: null,
        cooldownMinutes: null,
        envelope: { cpuCores: 0.25, ramBytes: 512 * 1024 * 1024, measuredThroughPlayers: 0 },
        sampleCount: 0,
      } as unknown as (typeof profiles)[number];
    }
    finalProfilesMap.set(baseProfile.key, baseProfile);

    // Editions for this game
    for (const ed of allEditionsMap.values()) {
      if (ed.gameSlug !== slug) continue;
      const editionKey = `${slug}:${ed.slug}`;
      const existing = existingByKey.get(editionKey) || profiles.find((p) => p.gameSlug === slug && p.editionSlug === ed.slug);
      if (existing) {
        finalProfilesMap.set(existing.key, existing);
      } else {
        finalProfilesMap.set(editionKey, {
          key: editionKey,
          gameSlug: slug,
          editionSlug: ed.slug,
          recipeSlug: baseProfile.recipeSlug || slug,
          verification: baseProfile.verification === "verified" || baseProfile.verification === "testing" ? baseProfile.verification : "testing",
          blockedReason: baseProfile.blockedReason || null,
          queryKind: baseProfile.queryKind || "none",
          queryVerified: baseProfile.queryVerified ?? false,
          joinVerified: baseProfile.joinVerified ?? false,
          enabled: false,
          rotationEligible: false,
          weight: 1,
          minimumOnlineMinutes: baseProfile.minimumOnlineMinutes ?? null,
          idleMinutes: baseProfile.idleMinutes ?? null,
          cooldownMinutes: baseProfile.cooldownMinutes ?? null,
          envelope: baseProfile.envelope ? { ...baseProfile.envelope } : { cpuCores: 0.25, ramBytes: 512 * 1024 * 1024, measuredThroughPlayers: 0 },
          sampleCount: 0,
        });
      }
    }
  }

  // Preserve any remaining stored profiles
  for (const p of profiles) {
    if (!finalProfilesMap.has(p.key)) finalProfilesMap.set(p.key, p);
  }

  return NextResponse.json({
    config: config || defaults, profiles: [...finalProfilesMap.values()], servers, reservations, titles, editionNames,
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
