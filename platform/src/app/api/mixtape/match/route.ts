import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import { registerMatch, reportMatch, matchState, dub } from "@/lib/mixtape/service";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
async function handle(req: Request, read: boolean) {
  const user = await userFromLauncherBearer(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = String(user._id);
  const limit = await checkRateLimit(`mixtape:${id}`, { max: 120, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ error: "Try again shortly" }, { status: 429 });
  try {
    if (read) return NextResponse.json(await matchState(id, new URL(req.url).searchParams.get("matchId") || ""), { headers: { "Cache-Control": "no-store" } });
    const body = await req.json();
    const result = body.action === "register" ? await registerMatch(id, body) : body.action === "report" ? await reportMatch(id, body) : body.action === "dub" ? await dub(id, body) : null;
    if (!result) throw new Error("Unknown match action");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Mixtape unavailable" }, { status: 409 }); }
}
export async function GET(req: Request) { return handle(req, true); }
export async function POST(req: Request) { return handle(req, false); }
