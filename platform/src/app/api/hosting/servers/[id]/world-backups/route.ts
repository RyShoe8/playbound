import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createWorldDataBackup, listWorldData, restoreWorldDataBackup } from "@/lib/dedicatedHosting/worldBackups";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the server's world-data backups, or `supported: false` for games with none. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await listWorldData(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ supported: result.supported, backups: result.backups, retention: result.retention }, { headers: { "cache-control": "no-store" } });
}

/** POST — { action: "create" } backs up the world now; { action: "restore", backupId } puts one back (server stopped). */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: string; backupId?: string } | null;
  if (body?.action === "create") {
    const result = await createWorldDataBackup(userId, id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, backup: result.backup });
  }
  if (body?.action === "restore") {
    const result = await restoreWorldDataBackup(userId, id, String(body.backupId || ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
