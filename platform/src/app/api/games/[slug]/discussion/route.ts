import { NextResponse } from "next/server";

/** @deprecated Use POST /api/games/[slug]/discussions */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has moved. Use POST /api/games/{slug}/discussions with category, title, and body.",
    },
    { status: 410 }
  );
}
