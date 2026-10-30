import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import { leaderboard } from "@/lib/hyperdisc/ranked";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** HyperDisc Arena leaderboard: the top 50 by rating, and the signed-in player's own rank. */
export async function GET(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) return reply({ error: "Sign in required" }, 401);
    return reply(await leaderboard(String(user._id)));
  } catch {
    return reply({ error: "Leaderboard unavailable. Try again shortly." }, 503);
  }
}
