import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { listLookingToParty } from "@/lib/playTogether/lookingToParty";

/**
 * GET /api/presence/lfg/list — everyone looking to party, with the games they
 * have installed.
 *
 * Signed-in only. Unlike the bare count this names people and exposes their
 * library, which is not something to hand to anonymous callers.
 */

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 100;
    const players = await listLookingToParty(limit);
    return NextResponse.json({ players }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/presence/lfg/list failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
