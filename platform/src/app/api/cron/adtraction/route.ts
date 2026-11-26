import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { syncAdtraction } from "@/lib/commerce/adtraction/sync";
import { safeAdtractionError } from "@/lib/commerce/adtraction/client";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncAdtraction();
    return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ error: safeAdtractionError(error) }, { status: 503 });
  }
}
