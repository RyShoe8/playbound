import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { authorizeServer, listActivity } from "@/lib/dedicatedHosting/access";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/hosting/servers/:id/activity — the server's audit trail, newest first. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const auth = await authorizeServer(userId, id, "server:view");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await listActivity(id);
  return NextResponse.json(
    {
      activity: rows.map((r) => ({
        id: String(r._id),
        at: r.createdAt,
        actor: r.actorName || (r.actorKind === "system" ? "PlayBound" : "Someone"),
        actorKind: r.actorKind,
        action: r.action,
        detail: r.detail || null,
      })),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
