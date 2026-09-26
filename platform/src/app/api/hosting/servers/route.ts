import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { createServer } from "@/lib/dedicatedHosting/servers";
import { customerServerView } from "@/lib/dedicatedHosting/view";

/** POST /api/hosting/servers — save a new server configuration (it starts stopped unless `start` is set). */
export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await createServer(userId, {
    profileKey: String(body.profileKey || ""),
    name: body.name,
    description: body.description,
    visibility: body.visibility,
    slots: Number(body.slots),
    settings: body.settings && typeof body.settings === "object" ? (body.settings as Record<string, unknown>) : undefined,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ server: customerServerView(result.server as Record<string, unknown>) }, { status: 201 });
}
