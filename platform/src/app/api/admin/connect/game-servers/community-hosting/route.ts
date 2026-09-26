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
import { HOSTABLE_SLUGS, HOSTABLE_GAMES, HOSTABLE_SLUG_ALIASES } from "@/lib/gameHost/catalog";
import { editions as seedEditions } from "@/lib/data/editions";
import { getEffectiveEnvelope, managedRoomSettings } from "@/lib/communityHosting/reconcile";
import { populationPeriods, populationReading } from "@/lib/communityHosting/population";
import { runningReservationEnvelope } from "@/lib/communityHosting/capacity";
import { managedQueryKind, queryManagedOccupancy, type ManagedOccupancy } from "@/lib/communityHosting/playerQuery";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();

  const aliasSlugs = Object.keys(HOSTABLE_SLUG_ALIASES);

  const [config, profiles, servers, reservations, metrics, agent] = await Promise.all([
    CommunityHostingConfig.findOne({ key: "global" }).lean(),
    CommunityServerProfile.find({ gameSlug: { $nin: aliasSlugs } }).sort({ gameSlug: 1 }).lean(),
    CommunityServer.find({
      desiredState: "running",
      runtimeState: { $in: ["running", "pending", "starting"] },
    }).sort({ updatedAt: -1 }).limit(50).lean(),
    CapacityReservation.find({ state: { $in: ["planned", "active", "missed"] } }).sort({ warmupAt: 1 }).limit(100).lean(),
    fetchGameHostMetrics(), listManagedHostRooms(),
  ]);
  const asOf = new Date();
  const population = await populationPeriods(config?.node?.regionKey || "us-central", asOf);
  const profileByKey = new Map(profiles.map((profile) => [profile.key, profile]));
  const serverById = new Map(servers.map((server) => [String(server._id), server]));
  const liveCounts = new Map<string, ManagedOccupancy | null>();
  if (agent.ok) {
    await Promise.all(agent.rooms.map(async (room) => {
      const id = String(room.communityServerId || "");
      const server = serverById.get(id);
      const profile = server ? profileByKey.get(server.profileKey) : null;
      const queryKind = managedQueryKind(server?.gameSlug || room.gameSlug, profile);
      const occupancy = queryKind ? await queryManagedOccupancy({
        queryKind, host: room.host, port: room.port, communityServerId: id,
        expectedMod: server?.gameSlug === "earth-2140-trilogy" ? "e2140" : undefined,
      }) : null;
      liveCounts.set(id, occupancy);
    }));
  }
  const visibleServers = servers.map((server) => {
    const occupancy = liveCounts.get(String(server._id));
    const profile = profileByKey.get(server.profileKey);
    const players = occupancy?.players;
    // When the live query succeeds, use its values; when it fails/times out
    // (occupancy === null), derive the cap from the same settings the
    // reconciler passed to the game-host when it started the server.
    const roomSettings = profile ? managedRoomSettings(profile.recipeSlug || profile.gameSlug, config || {}) : undefined;
    const storedMax = (server as unknown as { maxPlayerCount?: number }).maxPlayerCount;
    const fallbackMax = storedMax ?? roomSettings?.maxPlayers ?? null;
    const fallbackBots = roomSettings?.botFill ?? null;
    return {
      ...server,
      playerCount: players ?? null,
      maxPlayers: occupancy?.maxPlayers ?? fallbackMax,
      bots: occupancy?.bots ?? fallbackBots,
      playerCountCheckedAt: players == null ? null : asOf,
    };
  });
  population.current = agent.ok && agent.rooms.every((room) => serverById.has(String(room.communityServerId || "")))
    ? populationReading(visibleServers, asOf) : null;
  const runningReservations = agent.ok ? agent.rooms.map((room) => {
    const server = serverById.get(String(room.communityServerId || ""));
    const profile = server ? profileByKey.get(server.profileKey) : null;
    return runningReservationEnvelope({
      baseline: getEffectiveEnvelope(profile?.envelope, room.gameSlug, profile?.sampleCount),
      players: liveCounts.get(String(room.communityServerId || ""))?.players ?? null,
      observed: room.resources,
    });
  }) : [];
  const budgetUsage = {
    cpuCores: runningReservations.reduce((sum, envelope) => sum + envelope.cpuCores, 0),
    ramBytes: runningReservations.reduce((sum, envelope) => sum + envelope.ramBytes, 0),
  };
  const defaults = new CommunityHostingConfig({ key: "global" }).toObject();
  // Display names for the game/edition checklist; include only hostable canonical catalog games.
  const gameSlugs = [...new Set([...profiles.map((p) => p.gameSlug), ...HOSTABLE_SLUGS])].filter((s) => !HOSTABLE_SLUG_ALIASES[s]);
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
        envelope: { ...getEffectiveEnvelope(null, slug), measuredThroughPlayers: 0 },
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
          envelope: baseProfile.envelope ? { ...baseProfile.envelope } : { ...getEffectiveEnvelope(null, slug), measuredThroughPlayers: 0 },
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
    asOf: asOf.toISOString(),
    config: config || defaults, profiles: [...finalProfilesMap.values()], servers: visibleServers, reservations, titles, editionNames,
    metrics: metrics.ok ? metrics.metrics : null, population, budgetUsage,
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
