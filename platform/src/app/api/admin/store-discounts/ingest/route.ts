import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ingestStoreDiscounts } from "@/lib/storeDiscounts/ingestion";
import type { DiscountStoreSlug } from "@/lib/storeDiscounts/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    let stores: DiscountStoreSlug[] | undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body.stores)) stores = body.stores;
    } catch {
      // Empty body is fine — scans every store.
    }

    const results = await ingestStoreDiscounts({ stores });
    return NextResponse.json({ ok: true, results, at: new Date().toISOString() });
  } catch (err) {
    console.error("[admin-ingest] Store-discount scan failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
