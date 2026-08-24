import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { gamesFor, resolveGameForSync } from "@/lib/catalog";
import { getMod } from "@/lib/mods";
import { userFromLauncherBearer } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { revalidateLibraryPages } from "@/lib/libraryCascade";
import { groupInstallsBySlug } from "@/lib/library/installedEditions";

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

    const uniqueGameSlugs = [...new Set(body.installs.map((i) => i.slug))];
    const resolvedGames = await gamesFor(uniqueGameSlugs, { includeUnpublished: true });
    const gameBySlug = new Map(resolvedGames.map((g) => [g.slug, g]));

    const uniqueModSlugs = [...new Set((body.modInstalls || []).map((m) => m.slug))];
    const modBySlug = new Map(
      (
        await Promise.all(
          uniqueModSlugs.map(async (slug) => [slug, await getMod(slug)] as const)
        )
      ).filter((entry): entry is [string, NonNullable<Awaited<ReturnType<typeof getMod>>>] =>
        Boolean(entry[1])
      )
    );

    /*
     * One write per game, not per edition.
     *
     * The launcher sends a separate entry for every installed edition, and the
     * unique index gives a game exactly one row — so writing per entry meant
     * each edition's `$set` clobbered the one before it and only the last
     * survived. Grouping first lets the row carry all of them.
     */
    for (const item of groupInstallsBySlug(body.installs)) {
      if (!gameBySlug.has(item.slug) && !(await resolveGameForSync(item.slug))) {
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
            editionSlug: item.editionSlug,
            // Authoritative: this batch is the full picture for this device, so
            // an edition the player removed disappears rather than lingering.
            installedEditions: item.installedEditions,
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
      const mod = modBySlug.get(item.slug);
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

      // Delete custom games that are no longer in the launcher
      const customFilter =
        keepGames.length > 0
          ? { userId: user._id, gameSlug: { $nin: keepGames, $regex: /^custom-/ } }
          : { userId: user._id, gameSlug: { $regex: /^custom-/ } };
      await LibraryEntry.deleteMany(customFilter);

      const uninstalledFilter: Record<string, unknown> = {
        userId: user._id,
        installed: true,
        ...(keepGames.length > 0 ? { gameSlug: { $nin: keepGames } } : {}),
        $and: [
          {
            $or: [
              { platform: "desktop" },
              { platform: { $exists: false } },
              { platform: null },
            ],
          },
          /*
           * Only revoke what the launcher could have installed.
           *
           * This pass says "the launcher did not report it, so it is gone",
           * which is only true for rows the launcher owns. A store redirect
           * or a browser install is not the launcher's to un-install, and
           * sweeping them was marking games uninstalled that were never on
           * this device in the first place. `manual` is included because it
           * is the schema default every pre-`source` launcher row carries.
           */
          { $or: [{ source: "launcher" }, { source: "manual" }, { source: { $exists: false } }] },
        ],
      };
      const gameRes = await LibraryEntry.updateMany(uninstalledFilter, {
        $set: { installed: false, saved: true, updatedAt: now },
      });
      pruned = gameRes.modifiedCount || 0;

      if (keepMods.length) {
        const modFilter: Record<string, unknown> = {
          userId: user._id,
          installed: true,
          modSlug: { $nin: keepMods },
        };
        const modRes = await LibraryModEntry.deleteMany(modFilter);
        modsPruned = modRes.deletedCount || 0;
      }
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
