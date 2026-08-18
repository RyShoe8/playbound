import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { resolveGameForSync } from "@/lib/catalog";
import { getMod } from "@/lib/mods";
import { userFromLauncherBearer } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { revalidateLibraryPages } from "@/lib/libraryCascade";

const batchSchema = z.object({
  installs: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        version: z.string().max(80).optional(),
        editionSlug: z.string().max(80).nullable().optional(),
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
  prune: z.boolean().optional().default(true),
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
        // Launcher sync is always the desktop copy — see the single-item route.
        { userId: user._id, gameSlug: item.slug, platform: "desktop" },
        {
          $set: {
            installed: true,
            version: item.version || undefined,
            ...(item.editionSlug !== undefined
              ? { editionSlug: item.editionSlug || null }
              : {}),
            installedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: user._id,
            gameSlug: item.slug,
            platform: "desktop",
            source: "launcher",
            saved: false,
            addedAt: now,
          },
        },
        { upsert: true, returnDocument: "after" }
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
      // returnDocument: 'before' returns prior doc (null on insert) so we only telemetry first installs
      const prev = await LibraryModEntry.findOneAndUpdate(
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
        { upsert: true, returnDocument: "before" }
      );
      if (!prev || !prev.installed) {
        void saveEvent({
          event: "mod_installed",
          properties: {
            modSlug: item.slug,
            baseGameSlug: item.baseGameSlug,
            installMethod: "launcher",
            version: item.version,
          },
          userId: String(user._id),
          timestamp: now.toISOString(),
          userAgent: req.headers.get("user-agent"),
        }).catch(() => undefined);
      }
      modsSynced += 1;
    }

    let pruned = 0;
    let modsPruned = 0;
    if (body.prune) {
      const keepGames = body.installs.map((i) => i.slug);
      const keepMods = (body.modInstalls || []).map((i) => i.slug);
      const gameFilter: Record<string, unknown> = {
        userId: user._id,
        installed: true,
        $or: [{ platform: "desktop" }, { platform: { $exists: false } }, { platform: null }],
      };
      if (keepGames.length) gameFilter.gameSlug = { $nin: keepGames };
      const gameRes = await LibraryEntry.deleteMany(gameFilter);
      pruned = gameRes.deletedCount || 0;

      const modFilter: Record<string, unknown> = {
        userId: user._id,
        installed: true,
      };
      if (keepMods.length) modFilter.modSlug = { $nin: keepMods };
      const modRes = await LibraryModEntry.deleteMany(modFilter);
      modsPruned = modRes.deletedCount || 0;
      if (pruned || modsPruned) revalidateLibraryPages();
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      modsSynced,
      modsSkipped,
      pruned,
      modsPruned,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Library batch sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
