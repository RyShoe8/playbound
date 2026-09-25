import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { readPartyVersion } from "@/lib/realtime/partyVersion";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/parties/:id/version — the party's change stamp, `{ v }`.
 *
 * The launcher polls this every ~1.5s while a party is live and runs its full
 * party-sync only when `v` changes. `v: null` means no stamp is available
 * (cache unconfigured or cold), and the client falls back to its regular poll.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const v = await readPartyVersion(id);
  return NextResponse.json({ v }, { headers: { "cache-control": "no-store" } });
}
