import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { changeMap, getMaps, setNextMap, setRotation } from "@/lib/dedicatedHosting/liveControl";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/hosting/servers/:id/maps — the game's maps, the current one, and the saved rotation. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await getMaps(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { options, freeText, current, running, mode, canNext, canRotate, rotation } = result;
  return NextResponse.json({ options, freeText, current, running, mode, canNext, canRotate, rotation }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST — { action: "change", map } changes now; { action: "next", map } queues
 * the next map; { action: "rotation", maps: [...] } saves and installs a rotation.
 */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: string; map?: string; maps?: unknown } | null;
  const result =
    body?.action === "change"
      ? await changeMap(userId, id, String(body.map || ""))
      : body?.action === "next"
        ? await setNextMap(userId, id, String(body.map || ""))
        : body?.action === "rotation"
          ? await setRotation(userId, id, body.maps)
          : { error: "Unknown action", status: 400 as const };
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, applied: "applied" in result ? result.applied : true });
}
