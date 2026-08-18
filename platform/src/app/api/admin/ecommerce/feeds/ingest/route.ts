import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ingestStoreFeed, parseStoreSlug } from "@/lib/commerce/feedIngest";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const body = z.object({ store: z.string() }).parse(await req.json());
  const store = parseStoreSlug(body.store);
  if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 400 });
  const result = await ingestStoreFeed(store);
  return NextResponse.json(result, { status: result.error ? 422 : 200 });
}
