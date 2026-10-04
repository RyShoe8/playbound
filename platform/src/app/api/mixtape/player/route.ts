import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import { player, saveDeck } from "@/lib/mixtape/service";
async function handle(req: Request, write: boolean) {
  const user = await userFromLauncherBearer(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    return NextResponse.json(write ? await saveDeck(String(user._id), (await req.json()).trackIds) : await player(String(user._id)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Mixtape unavailable" }, { status: 409 });
  }
}
export async function GET(req: Request) { return handle(req, false); }
export async function PUT(req: Request) { return handle(req, true); }
