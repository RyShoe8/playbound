import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverLauncherInstall } from "@/lib/discoverInstall";
import { toPayloadLauncherInstall } from "@/lib/gamePayload";
import { requireAdminSession } from "@/lib/requireAdmin";

const schema = z.object({
  website: z.string().trim().url().max(500),
  steamAppId: z
    .union([z.string().trim().regex(/^\d+$/), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  githubRepo: z
    .union([
      z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (!v ? null : v)),
});

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = schema.parse(await req.json());
    const { recipe, source } = await discoverLauncherInstall({
      website: body.website,
      steamAppId: body.steamAppId,
    });

    return NextResponse.json({
      recipe: toPayloadLauncherInstall(recipe),
      source,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Discover install error:", err);
    return NextResponse.json({ error: "Could not discover install recipe" }, { status: 502 });
  }
}
