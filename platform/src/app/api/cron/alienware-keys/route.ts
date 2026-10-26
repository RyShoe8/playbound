import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { ingestFreeOffers } from "@/lib/freeOffers/ingestion";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [result] = await ingestFreeOffers({ stores: ["alienware_arena"] });
  return NextResponse.json({ ok: result.status === "success", result }, {
    status: result.status === "success" ? 200 : 502,
  });
}
