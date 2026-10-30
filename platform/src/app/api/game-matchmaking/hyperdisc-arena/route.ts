import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { cancel, poll, queue, setRoom } from "@/lib/hyperdisc/ranked";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * HyperDisc Arena quick match.
 * - queue {version}: returns {joinCode} to join a waiting player's room, or {host: true} to open one.
 * - room {joinCode}: the queued player's private room is open.
 * - poll: keeps the ticket alive; {status: waiting | matched | gone}.
 * - cancel: leaves the queue.
 */
export async function POST(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) return reply({ error: "Sign in required" }, 401);
    const userId = String(user._id);
    if (!(await checkRateLimit(`hyperdisc-matchmaking:${userId}`, { max: 60, windowMs: 60000 })).ok) return reply({ error: "Please wait" }, 429);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "queue": {
        const version = typeof body.version === "string" ? body.version.slice(0, 64) : "";
        if (!version) return reply({ error: "Game version required" }, 400);
        return reply(await queue(userId, version));
      }
      case "room":
        return (await setRoom(userId, String(body.joinCode || ""))) ? reply({ ok: true }) : reply({ error: "Not in the queue" }, 409);
      case "poll":
        return reply(await poll(userId));
      case "cancel":
        await cancel(userId);
        return reply({ ok: true });
      default:
        return reply({ error: "Unknown action" }, 400);
    }
  } catch {
    return reply({ error: "Matchmaking unavailable. Try again shortly." }, 503);
  }
}
