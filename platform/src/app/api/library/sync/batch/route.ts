import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { resolveGameForSync } from "@/lib/catalog";
import { getMod } from "@/lib/mods";
import { userFromLauncherBearer } from "@/lib/library";

const batchSchema = z.object({
  installs: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        version: z.string().max(80).optional(),
      })
    )
    .max(100)
    .default([]),
  modInstalls: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        baseGameSlug: z.string().min(1).max(80),
        version: z.string().max(80).optional(),
      })
    )
    .max(100)
    .optional()
    .default([]),
});

export async function POST(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) {
      return NextResponse.json({ error: "Invalid or missing launcher token" }, { status: 401 });
    }

    const body = batchSchema.parse(await req.json());
    await dbConnect();
    const now = new Date();
    let synced = 0;
    const skipped: string[] = [];

    for (const item of body.installs) {
      if (!(await resolveGameForSync(item.slug))) {
        skipped.push(item.slug);
        continue;
      }
      await LibraryEntry.findOneAndUpdate(
        { userId: user._id, gameSlug: item.slug },
        {
          $set: {
            installed: true,
            version: item.version || undefined,
            installedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: user._id,
            gameSlug: item.slug,
            saved: false,
            addedAt: now,
          },
        },
        { upsert: true, new: true }
      );
      synced += 1;
    }

    let modsSynced = 0;
    const modsSkipped: string[] = [];
    for (const item of body.modInstalls || []) {
      const mod = await getMod(item.slug);
      if (!mod || mod.baseGameSlug !== item.baseGameSlug) {
        modsSkipped.push(item.slug);
        continue;
      }
      await LibraryModEntry.findOneAndUpdate(
        { userId: user._id, modSlug: item.slug },
        {
          $set: {
            installed: true,
            baseGameSlug: item.baseGameSlug,
            version: item.version || undefined,
            installedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: user._id,
            modSlug: item.slug,
          },
        },
        { upsert: true, new: true }
      );
      modsSynced += 1;
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      modsSynced,
      modsSkipped,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Library batch sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
