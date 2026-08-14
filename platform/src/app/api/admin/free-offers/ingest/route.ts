import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ingestFreeOffers } from "@/lib/freeOffers/ingestion";
import type { StoreSlug } from "@/lib/freeOffers/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    let stores: StoreSlug[] | undefined = undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body.stores)) {
        stores = body.stores;
      }
    } catch {
      // Empty body is fine — ingests all stores
    }

    const results = await ingestFreeOffers({ stores });
    return NextResponse.json({ ok: true, results, at: new Date().toISOString() });
  } catch (err) {
    console.error("[admin-ingest] Ingestion failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
