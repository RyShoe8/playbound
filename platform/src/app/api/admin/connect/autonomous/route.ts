import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  getAutonomousConfig,
  saveAutonomousConfig,
  checkAndTeardownExpiredMatches,
} from "@/lib/matchmaker/autonomousService";
import AutonomousMatchLog from "@/lib/models/AutonomousMatchLog";
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
  await checkAndTeardownExpiredMatches();

  const config = await getAutonomousConfig();
  const logs = await AutonomousMatchLog.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

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
    CatalogGame.find({ masterCopy: true })
      .select("slug title coverImage launchMethods features")
      .lean(),
    Edition.find({
      gameSlug: { $in: slugsArr },
      visibility: { $ne: "hidden" },
      status: { $ne: "archived" },
    })
      .select("gameSlug slug name shortDescription")
      .lean(),
  ]);

  const candidateGames = slugsArr.map((slug) => {
    const staticGame = staticGames.find((g) => g.slug === slug);
    const dbMatch = dbGames.find((dbG) => (dbG as { slug?: string }).slug === slug);
    const title = (dbMatch as { title?: string })?.title || staticGame?.title || slug;
    const coverImage = (dbMatch as { coverImage?: string })?.coverImage || staticGame?.coverImage || undefined;

    // Gather editions for this game
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
  });

  // Get VPS Host health
  const hostHealth = await fetchGameHostHealth().catch(() => null);

  return NextResponse.json({
    ok: true,
    config,
    logs,
    candidateGames,
    hostConfigured: hostHealth?.configured ?? false,
    hostHealth: hostHealth && "health" in hostHealth ? hostHealth.health : null,
  });
}

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const updated = await saveAutonomousConfig(body);

  return NextResponse.json({ ok: true, config: updated });
}
