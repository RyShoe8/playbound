import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { cronAuthorized } from "@/lib/cronAuth";
import { ingestFreeOffers } from "@/lib/freeOffers/ingestion";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const results = await ingestFreeOffers();

  const summary = {
    at: new Date().toISOString(),
    providers: results.map((r) => ({
      provider: r.provider,
      status: r.status,
      offersFound: r.offersFound,
      offersCreated: r.offersCreated,
      offersUpdated: r.offersUpdated,
      offersExpired: r.offersExpired,
      gamesMatched: r.gamesMatched,
      gamesCreated: r.gamesCreated,
      gamesUnmatched: r.gamesUnmatched,
      durationMs: r.durationMs,
      error: r.error || null,
    })),
  };

  const anyFailed = results.some((r) => r.status === "failed");
  return NextResponse.json(
    { ok: !anyFailed, summary },
    { status: anyFailed ? 207 : 200 }
  );
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
