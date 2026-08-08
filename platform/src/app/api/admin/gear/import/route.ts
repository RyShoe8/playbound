import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { importGearFromUrl } from "@/lib/gearImport";

const importSchema = z.object({
  url: z.string().trim().url().max(1000),
});

/**
 * Prefill a gear draft from an affiliate / product URL.
 * Returns title, description, media, and a single affiliateLinks entry.
 */
export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url } = importSchema.parse(await req.json());
    const result = await importGearFromUrl(url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Gear import error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
