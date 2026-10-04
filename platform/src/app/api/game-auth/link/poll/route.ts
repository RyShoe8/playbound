import { NextResponse } from "next/server";
import { pollGameLink } from "@/lib/gameAuth";

/**
 * POST /api/game-auth/link/poll  { pollToken }
 *
 * The game polls every few seconds. Responses (always JSON with `status`):
 *   pending                 keep polling
 *   approved                { token, user } — store the token, stop polling
 *   denied | expired        stop; start again if the player wants
 *   invalid (404)           unknown or already-claimed poll token
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pollToken?: unknown };
  try {
    const result = await pollGameLink(String(body.pollToken ?? ""));
    const status = result.status === "invalid" ? 404 : result.status === "expired" || result.status === "denied" ? 410 : 200;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/game-auth/link/poll failed:", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
