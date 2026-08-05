import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchCombinedGameMedia } from "@/lib/fetchGameMedia";
import { requireAdminSession } from "@/lib/requireAdmin";

const schema = z
  .object({
    url: z.string().trim().url().max(500).optional().nullable(),
    steamAppId: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .max(20)
      .optional()
      .nullable(),
  })
  .refine((v) => Boolean(v.url?.trim()) || Boolean(v.steamAppId?.trim()), {
    message: "Provide a website URL or Steam app id",
  });

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = schema.parse(await req.json());
    const media = await fetchCombinedGameMedia({
      url: body.url,
      steamAppId: body.steamAppId,
    });

    return NextResponse.json({
      coverImage: media.coverImage,
      screenshots: media.screenshots,
      videos: media.videos,
      images: media.screenshots,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Media fetch failed";
    console.error("Media fetch error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
