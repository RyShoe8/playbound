import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { syncAdtraction } from "@/lib/commerce/adtraction/sync";
import { safeAdtractionError } from "@/lib/commerce/adtraction/client";

export const maxDuration = 60;
export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const result = await syncAdtraction();
    return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({ error: safeAdtractionError(error) }, { status: 503 });
  }
}
