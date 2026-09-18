import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { sweepAndMatchLookingUsers } from "@/lib/playTogether/ltpMatch";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepAndMatchLookingUsers();
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    ...result,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
