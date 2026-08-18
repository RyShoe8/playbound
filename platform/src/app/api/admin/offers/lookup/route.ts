import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { lookupStorePrice, StorePriceError } from "@/lib/access/storePrices";

export const maxDuration = 15;

const bodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
});

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { url } = bodySchema.parse(await req.json());
    const result = await lookupStorePrice(url);
    return NextResponse.json({
      ...result,
      lastCheckedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || "Invalid URL" }, { status: 400 });
    }
    if (err instanceof StorePriceError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("offer lookup failed:", err);
    return NextResponse.json({ error: "Could not look up that store price." }, { status: 502 });
  }
}
