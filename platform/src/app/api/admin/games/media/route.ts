import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchPageMeta } from "@/lib/pageMeta";
import { requireAdminSession } from "@/lib/requireAdmin";

const schema = z.object({
  url: z.string().trim().url().max(500),
});

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url } = schema.parse(await req.json());
    const meta = await fetchPageMeta(url);

    return NextResponse.json({
      title: meta.title,
      description: meta.description,
      images: meta.images,
      coverImage: meta.images[0] ?? null,
      screenshots: meta.images.slice(0, 8),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Media fetch failed";
    console.error("Media fetch error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
