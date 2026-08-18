import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ingestStoreFeed, parseStoreSlug } from "@/lib/commerce/feedIngest";

export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function looksLikeFeed(name: string, type: string): boolean {
  const lower = name.toLowerCase();
  if (/\.(csv|tsv|txt|json|xml|rss|atom)$/i.test(lower)) return true;
  const t = type.toLowerCase();
  return (
    t.includes("csv") ||
    t.includes("json") ||
    t.includes("xml") ||
    t.includes("rss") ||
    t.includes("atom") ||
    t.includes("text/plain") ||
    t.includes("octet-stream") ||
    t === ""
  );
}

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const store = parseStoreSlug(form.get("store"));
    if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a feed file to upload." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Max feed size is 8MB." }, { status: 400 });
    }
    if (!looksLikeFeed(file.name, file.type)) {
      return NextResponse.json({ error: "Upload a CSV, JSON, or XML feed." }, { status: 400 });
    }
    const body = await file.text();
    const result = await ingestStoreFeed(store, {
      body,
      contentType: file.type || file.name,
    });
    return NextResponse.json(result, { status: result.error ? 422 : 200 });
  }

  const parsed = z.object({ store: z.string() }).parse(await req.json());
  const store = parseStoreSlug(parsed.store);
  if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 400 });
  const result = await ingestStoreFeed(store);
  return NextResponse.json(result, { status: result.error ? 422 : 200 });
}
