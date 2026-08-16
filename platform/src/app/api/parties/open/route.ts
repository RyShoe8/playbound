import { NextResponse } from "next/server";
import { listOpenPublicParties } from "@/lib/playTogether/party";

/** GET /api/parties/open — public joinable parties. No auth required. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? raw : 50;
    const parties = await listOpenPublicParties(limit);
    return NextResponse.json({ parties });
  } catch (err) {
    console.error("GET /api/parties/open failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
