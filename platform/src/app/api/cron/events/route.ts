import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runEventsCron } from "@/lib/events/cron";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runEventsCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("events cron failed", err);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
