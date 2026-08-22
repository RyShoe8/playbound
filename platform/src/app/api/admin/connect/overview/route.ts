import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { HOSTABLE_GAMES } from "@/lib/gameHost/catalog";
import {
  fetchGameHostHealth,
  fetchGameHostMetrics,
  getGameHostPublicIp,
  isGameHostConfigured,
  listHostRooms,
} from "@/lib/gameHost/client";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const configured = isGameHostConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      host: null,
      health: null,
      metrics: null,
      rooms: [],
      games: [],
      alerts: [
        {
          type: "info",
          title: "Connect not configured",
          message: "Set GAME_HOST_URL and GAME_HOST_SECRET on Vercel to monitor the VPS agent.",
        },
      ],
    });
  }

  const [healthResult, metricsResult, roomsResult] = await Promise.all([
    fetchGameHostHealth(),
    fetchGameHostMetrics(),
    listHostRooms(),
  ]);

  const alerts: Array<{ type: "warning" | "error" | "info"; title: string; message: string }> = [];

  if (!healthResult.configured) {
    alerts.push({
      type: "error",
      title: "Game host unreachable",
      message: healthResult.error,
    });
  }

  const metrics = metricsResult.ok ? metricsResult.metrics : null;
  if (!metricsResult.ok) {
    alerts.push({
      type: "warning",
      title: metricsResult.outdatedAgent ? "VPS agent outdated" : "Metrics unavailable",
      message: metricsResult.error,
    });
  } else if (metrics) {
    if ((metrics.cpu?.usagePercent ?? 0) > 85) {
      alerts.push({
        type: "warning",
        title: "High CPU",
        message: `CPU usage is ${metrics.cpu?.usagePercent}% on the VPS.`,
      });
    }
    const rootDisk = metrics.storage?.find((s) => s.path === "/");
    if (rootDisk && rootDisk.usedPercent > 90) {
      alerts.push({
        type: "warning",
        title: "Low disk space",
        message: `Root filesystem is ${rootDisk.usedPercent}% full.`,
      });
    }
  }

  const health = healthResult.configured ? healthResult.health : null;
  const gameStatus = health?.gameStatus || {};
  const games = Object.values(HOSTABLE_GAMES).map((game) => {
    const status = gameStatus[game.slug];
    const installed = status?.installed ?? health?.games?.[game.slug] ?? false;
    const ready = status?.ready ?? installed;
    return {
      slug: game.slug,
      title: game.title,
      installed,
      ready,
      defaultPort: game.defaultPort,
      protocol: game.protocol,
    };
  });

  for (const game of games) {
    if (game.slug === "wolfenstein-enemy-territory" && game.installed && !game.ready) {
      alerts.push({
        type: "error",
        title: "Wolfenstein ET not ready",
        message: "etlded exists but etmain/pak0.pk3 is missing — run Ensure missing games on the VPS.",
      });
      break;
    }
  }

  return NextResponse.json({
    configured: true,
    host: getGameHostPublicIp() || health?.publicIp || null,
    health,
    metrics,
    lastSpawnTest: health?.lastSpawnTest ?? {},
    rooms: roomsResult.ok ? roomsResult.rooms : [],
    roomsError: roomsResult.ok ? null : roomsResult.error,
    games,
    alerts,
  });
}
