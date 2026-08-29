import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  getAutomatedEventConfig,
  saveAutomatedEventConfig,
  checkAndTeardownExpiredEvents,
} from "@/lib/events/automatedEventPlannerService";
import AutomatedEventLog from "@/lib/models/AutomatedEventLog";
import PlatformEvent from "@/lib/models/PlatformEvent";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { games as staticGames } from "@/lib/data/games";
import { editions as staticEditions } from "@/lib/data/editions";
import { fetchGameHostHealth } from "@/lib/gameHost/client";
import { HOSTABLE_SLUGS, isHostableGame } from "@/lib/gameHost/catalog";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  // Run a quick expiration check
  await checkAndTeardownExpiredEvents();

  const config = await getAutomatedEventConfig();
  const logs = await AutomatedEventLog.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  // Backfill any pop-up PlatformEvents created recently without an AutomatedEventLog
  const existingLogEventIds = new Set(
    logs.map((l) => String(l.eventId)).filter(Boolean)
  );

  const recentPopUpEvents = await PlatformEvent.find({
    $or: [
      { title: { $regex: /^⚡ Pop-Up/i } },
      { hostType: "playbound", eventType: "game_night" },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  for (const pe of recentPopUpEvents) {
    if (!existingLogEventIds.has(String(pe._id))) {
      try {
        const createdLog = await AutomatedEventLog.create({
          gameSlug: pe.gameSlug,
          editionSlug: pe.editionSlug || null,
          gameTitle: pe.title.replace(/^⚡\s*Pop-Up\s*Game\s*Night:\s*/i, ""),
          eventId: pe._id,
          startedAt: pe.startsAt || pe.createdAt,
          endsAt: pe.endsAt || null,
          status:
            pe.status === "live"
              ? "live"
              : pe.status === "registration_open"
              ? "scheduled"
              : "completed",
        });
        logs.push(createdLog.toObject());
        existingLogEventIds.add(String(pe._id));
      } catch {
        // ignore duplicate
      }
    }
  }

  logs.sort(
    (a, b) =>
      new Date(b.startedAt || b.createdAt).getTime() -
      new Date(a.startedAt || a.createdAt).getTime()
  );

  const candidateSlugs = new Set<string>();
  for (const slug of HOSTABLE_SLUGS) {
    candidateSlugs.add(slug);
  }
  for (const g of staticGames) {
    if (isHostableGame(g.slug)) {
      candidateSlugs.add(g.slug);
    }
  }
  for (const g of config.games) {
    if (isHostableGame(g.slug)) {
      candidateSlugs.add(g.slug);
    }
  }

  const slugsArr = Array.from(candidateSlugs);

  const [dbGames, dbEditions] = await Promise.all([
    CatalogGame.find({ slug: { $in: slugsArr } })
      .select("slug title coverImage launchMethods features status")
      .lean(),
    Edition.find({
      gameSlug: { $in: slugsArr },
      visibility: { $ne: "hidden" },
      status: { $ne: "archived" },
    })
      .select("gameSlug slug name shortDescription")
      .lean(),
  ]);

  const candidateGames = slugsArr
    .map((slug) => {
      const staticGame = staticGames.find((g) => g.slug === slug);
      const dbMatch = dbGames.find((dbG) => (dbG as { slug?: string }).slug === slug) as
        | { slug?: string; title?: string; coverImage?: string; status?: string }
        | undefined;

      const status = dbMatch?.status ?? staticGame?.status ?? "published";
      // Exclude games in testing or draft status from the Event Planner
      if (status === "testing" || status === "draft") {
        return null;
      }

      const title = dbMatch?.title || staticGame?.title || slug;
      const coverImage = dbMatch?.coverImage || staticGame?.coverImage || undefined;

      const gameDbEditions = dbEditions.filter((e) => (e as { gameSlug?: string }).gameSlug === slug);
      const gameStaticEditions = staticEditions.filter(
        (e) => e.gameSlug === slug && e.visibility !== "hidden" && e.status !== "archived"
      );

      const editionMap = new Map<string, { slug: string; name: string; shortDescription?: string }>();
      for (const e of gameStaticEditions) {
        if (e.slug !== "official" && e.slug !== "default") {
          editionMap.set(e.slug, { slug: e.slug, name: e.name, shortDescription: e.shortDescription });
        }
      }
      for (const e of gameDbEditions) {
        const ed = e as { slug: string; name: string; shortDescription?: string };
        if (ed.slug !== "official" && ed.slug !== "default") {
          editionMap.set(ed.slug, { slug: ed.slug, name: ed.name, shortDescription: ed.shortDescription });
        }
      }

      return {
        slug,
        title,
        coverImage,
        editions: Array.from(editionMap.values()),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  // Get VPS Host health
  const hostHealth = await fetchGameHostHealth().catch(() => null);

  return NextResponse.json({
    ok: true,
    config,
    logs,
    candidateGames,
    hostConfigured: hostHealth?.configured ?? false,
    botConfigured: Boolean(process.env.DISCORD_BOT_WEBHOOK_URL),
  });
}

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const updated = await saveAutomatedEventConfig(body);

  return NextResponse.json({ ok: true, config: updated });
}

export async function PUT(req: Request) {
  return POST(req);
}
