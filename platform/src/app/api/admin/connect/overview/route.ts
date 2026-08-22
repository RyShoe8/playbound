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
import { hostableGameVersionRows } from "@/lib/gameHost/versions";

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
    const unreachableHint =
      /fetch failed|timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(healthResult.error);
    alerts.push({
      type: "error",
      title: "Game host unreachable",
      message: unreachableHint
        ? `${healthResult.error} — Vercel cannot reach the VPS on port 8741. Open 8741/tcp in the Contabo firewall panel (in addition to ufw on the VM). Confirm GAME_HOST_URL=http://147.93.133.235:8741 and GAME_HOST_SECRET on Vercel Production.`
        : healthResult.error,
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
  const versionRows = hostableGameVersionRows(health?.gameVersions || {});
  const versionBySlug = Object.fromEntries(versionRows.map((v) => [v.slug, v]));
  const games = Object.values(HOSTABLE_GAMES).map((game) => {
    const status = gameStatus[game.slug];
    const installed = status?.installed ?? health?.games?.[game.slug] ?? false;
    const ready = status?.ready ?? installed;
    const versions = versionBySlug[game.slug];
    return {
      slug: game.slug,
      title: game.title,
      installed,
      ready,
      defaultPort: game.defaultPort,
      protocol: game.protocol,
      clientVersion: versions?.clientVersion ?? "—",
      serverVersion: versions?.serverVersion ?? "—",
      serverVersionSource: versions?.serverVersionSource ?? "expected",
      versionMismatch: versions?.versionMismatch ?? false,
    };
  });

  if (healthResult.configured) {
    for (const game of games) {
      if (game.versionMismatch) {
        alerts.push({
          type: "warning",
          title: `${game.title} version skew`,
          message: `Launcher ships client ${game.clientVersion} but the VPS server reports ${game.serverVersion}. Party joins may fail until install.sh is re-run.`,
        });
      }
    }
  }

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
