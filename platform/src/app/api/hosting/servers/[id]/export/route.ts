import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { exportServer } from "@/lib/dedicatedHosting/backups";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the server's configuration as a JSON download (no player addresses, no game files). */
export async function GET(req: Request, ctx: Ctx) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await exportServer(userId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return new NextResponse(JSON.stringify(result.file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="playbound-server-${result.slug.replace(/[^a-z0-9-]/gi, "")}.json"`,
      "cache-control": "no-store",
    },
  });
}
