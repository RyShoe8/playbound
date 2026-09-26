import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { authorizeServer, grantAccess, listAccess, revokeAccess } from "@/lib/dedicatedHosting/access";

type Ctx = { params: Promise<{ id: string }> };

/** GET — everyone with a role on the server. Visible to anyone with a role. */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const auth = await authorizeServer(userId, id, "server:view");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ people: await listAccess(auth.server) });
}

/** POST — { username, role: "administrator" | "moderator" }. Owner only (server:manage_access). */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { username?: string; role?: string } | null;
  const result = await grantAccess(id, userId, String(body?.username ?? ""), body?.role);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** DELETE — { userId }. The owner removes someone, or anyone removes themselves. */
export async function DELETE(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const result = await revokeAccess(id, userId, String(body?.userId ?? ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
