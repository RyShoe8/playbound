import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createBackup, deleteBackup, listBackups, restoreBackup } from "@/lib/dedicatedHosting/backups";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the server's restore points, newest first, and how many it keeps. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await listBackups(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ backups: result.backups, retention: result.retention }, { headers: { "cache-control": "no-store" } });
}

/** POST — { action: "create", label? } makes a restore point; { action: "restore", backupId } puts one back. */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: string; label?: string; backupId?: string } | null;
  if (body?.action === "create") {
    const result = await createBackup(userId, id, body.label);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, id: result.id });
  }
  if (body?.action === "restore") {
    const result = await restoreBackup(userId, id, String(body.backupId || ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, notes: result.notes });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** DELETE — { backupId }. */
export async function DELETE(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { backupId?: string } | null;
  const result = await deleteBackup(userId, id, String(body?.backupId || ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
