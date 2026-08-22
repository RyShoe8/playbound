import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { ensureMissingHostGames, isGameHostConfigured } from "@/lib/gameHost/client";

export const maxDuration = 300;

/**
 * GET|POST /api/cron/game-host-ensure
 * Daily backup: ask the VPS to install any missing auto-installable dedicated
 * binaries (ET: Legacy etlded, …). Primary path is `npm run sync:game-host`
 * during production build.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGameHostConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "GAME_HOST_URL / GAME_HOST_SECRET unset",
    });
  }

  const result = await ensureMissingHostGames();
  return NextResponse.json(
    {
      at: new Date().toISOString(),
      ...result,
    },
    { status: result.ok || result.skipped ? 200 : 207 }
  );
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
