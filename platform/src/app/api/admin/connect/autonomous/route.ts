import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  getAutonomousConfig,
  saveAutonomousConfig,
  checkAndTeardownExpiredMatches,
} from "@/lib/matchmaker/autonomousService";
import AutonomousMatchLog from "@/lib/models/AutonomousMatchLog";
import CatalogGame from "@/lib/models/CatalogGame";
import { games as staticGames } from "@/lib/data/games";
import { fetchGameHostHealth } from "@/lib/gameHost/client";

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

  // Fetch candidate games that have multiplayer/dedicated server capability
  const dbGames = await CatalogGame.find({ masterCopy: true })
    .select("slug title coverImage launchMethods features")
    .lean();

  const candidateGames = staticGames
    .filter((g) => g.launchMethods?.includes("server") || g.features?.includes("Dedicated Servers"))
    .map((g) => {
      const dbMatch = dbGames.find((dbG) => (dbG as { slug?: string }).slug === g.slug);
      return {
        slug: g.slug,
        title: (dbMatch as { title?: string })?.title || g.title,
        coverImage: (dbMatch as { coverImage?: string })?.coverImage || g.coverImage,
      };
    });

  // Also include any games currently in the config games list
  for (const g of config.games) {
    if (!candidateGames.some((c) => c.slug === g.slug)) {
      const match = dbGames.find((dbG) => (dbG as { slug?: string }).slug === g.slug);
      candidateGames.push({
        slug: g.slug,
        title: (match as { title?: string })?.title || g.slug,
        coverImage: (match as { coverImage?: string })?.coverImage || undefined,
      });
    }
  }

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
