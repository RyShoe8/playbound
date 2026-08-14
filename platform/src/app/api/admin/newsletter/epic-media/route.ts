import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { lookupEpicNewsletterMedia } from "@/lib/epicStore";

export const maxDuration = 60;

const schema = z.object({
  storeUrl: z.string().trim().max(2000).optional(),
  title: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = schema.parse(await req.json().catch(() => ({})));
    if (!body.storeUrl && !body.title) {
      return NextResponse.json({ error: "Provide a store URL or title" }, { status: 400 });
    }

    const media = await lookupEpicNewsletterMedia({
      storeUrl: body.storeUrl,
      title: body.title,
    });
    if (!media) {
      return NextResponse.json({ error: "Epic product not found" }, { status: 404 });
    }

    return NextResponse.json(media);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Epic newsletter media lookup failed:", err);
    const message = err instanceof Error ? err.message : "Epic media lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
