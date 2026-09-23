import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { cronAuthorized } from "@/lib/cronAuth";
import { ingestStoreDiscounts } from "@/lib/storeDiscounts/ingestion";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const results = await ingestStoreDiscounts();

  const summary = {
    at: new Date().toISOString(),
    providers: results.map((r) => ({
      provider: r.provider,
      status: r.status,
      discountsFound: r.discountsFound,
      discountsCreated: r.discountsCreated,
      discountsUpdated: r.discountsUpdated,
      discountsExpired: r.discountsExpired,
      durationMs: r.durationMs,
      error: r.error || null,
    })),
  };

  const anyFailed = results.some((r) => r.status === "failed");
  return NextResponse.json({ ok: !anyFailed, summary }, { status: anyFailed ? 207 : 200 });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
