import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { clientIpFrom } from "@/lib/recaptcha";
import {
  createGameLink,
  formatLinkCode,
  gameLinkUrl,
  GAME_LINK_POLL_INTERVAL_MS,
  GAME_LINK_TTL_MS,
  normalizeGameSlug,
  sanitizeDeviceName,
} from "@/lib/gameAuth";

/**
 * POST /api/game-auth/link  { gameSlug, deviceName }
 *
 * A game starts "Sign in with PlayBound". Returns a short code to show, the
 * page to open (/link?code=…), and a secret pollToken for
 * POST /api/game-auth/link/poll. No account needed to call this.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { gameSlug?: unknown; deviceName?: unknown };
  const gameSlug = normalizeGameSlug(body.gameSlug);
  if (!gameSlug) {
    return NextResponse.json({ error: "gameSlug required" }, { status: 400 });
  }

  const ip = clientIpFrom(req) || "unknown";
  const limit = await checkRateLimit(`game-link:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  try {
    const link = await createGameLink({ gameSlug, deviceName: sanitizeDeviceName(body.deviceName) });
    return NextResponse.json(
      {
        code: formatLinkCode(link.code),
        pollToken: link.pollToken,
        verifyUrl: gameLinkUrl(link.code),
        expiresInMs: GAME_LINK_TTL_MS,
        intervalMs: GAME_LINK_POLL_INTERVAL_MS,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/game-auth/link failed:", err);
    return NextResponse.json({ error: "Couldn't start sign-in" }, { status: 500 });
  }
}
