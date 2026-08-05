import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { resolveGameForSync } from "@/lib/catalog";
import { getMod } from "@/lib/mods";
import { userFromLauncherBearer } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

const syncSchema = z.object({
  kind: z.enum(["game", "mod"]).optional().default("game"),
  slug: z.string().min(1).max(80),
  baseGameSlug: z.string().min(1).max(80).optional(),
  action: z.enum(["install", "uninstall"]),
  version: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await userFromLauncherBearer(req);
    if (!user) {
      return NextResponse.json({ error: "Invalid or missing launcher token" }, { status: 401 });
    }

    const body = syncSchema.parse(await req.json());
    await dbConnect();
    const now = new Date();

    if (body.kind === "mod") {
      if (!body.baseGameSlug) {
        return NextResponse.json({ error: "baseGameSlug required for mods" }, { status: 400 });
      }
      const mod = await getMod(body.slug);
      if (!mod || mod.baseGameSlug !== body.baseGameSlug) {
        return NextResponse.json({ error: "Unknown mod" }, { status: 404 });
      }

      if (body.action === "install") {
        // new:false returns prior doc (null on insert) so we only telemetry first installs
        const prev = await LibraryModEntry.findOneAndUpdate(
          { userId: user._id, modSlug: body.slug },
          {
            $set: {
              installed: true,
              baseGameSlug: body.baseGameSlug,
              version: body.version || undefined,
              installedAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: user._id,
              modSlug: body.slug,
            },
          },
          { upsert: true, new: false }
        );
        if (!prev || !prev.installed) {
          void saveEvent({
            event: "mod_installed",
            properties: {
              modSlug: body.slug,
              baseGameSlug: body.baseGameSlug,
              installMethod: "launcher",
              version: body.version,
            },
            userId: String(user._id),
            timestamp: now.toISOString(),
            userAgent: req.headers.get("user-agent"),
          }).catch(() => undefined);
        }
        return NextResponse.json({
          success: true,
          kind: "mod",
          modSlug: body.slug,
          baseGameSlug: body.baseGameSlug,
          installed: true,
        });
      }

      await LibraryModEntry.deleteOne({ userId: user._id, modSlug: body.slug });
      return NextResponse.json({ success: true, kind: "mod", deleted: true });
    }

    if (!(await resolveGameForSync(body.slug))) {
      return NextResponse.json({ error: "Unknown game" }, { status: 404 });
    }

    if (body.action === "install") {
      const entry = await LibraryEntry.findOneAndUpdate(
        // The launcher only runs on desktop, so its installs are always the
        // desktop copy — and must not collide with the same game installed
        // from a phone's app store.
        { userId: user._id, gameSlug: body.slug, platform: "desktop" },
        {
          $set: {
            installed: true,
            version: body.version || undefined,
            installedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: user._id,
            gameSlug: body.slug,
            platform: "desktop",
            source: "launcher",
            saved: false,
            addedAt: now,
          },
        },
        { upsert: true, new: true }
      );
      void saveEvent({
        event: "game_installed",
        properties: {
          gameSlug: body.slug,
          installMethod: "launcher",
          platform: "desktop",
          version: body.version,
        },
        userId: String(user._id),
        timestamp: now.toISOString(),
        userAgent: req.headers.get("user-agent"),
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        gameSlug: entry.gameSlug,
        installed: true,
        saved: false,
      });
    }

    // Uninstalling via the launcher removes the desktop copy only. Legacy
    // entries have no platform and are desktop by definition, so they must
    // match too or they become unremovable.
    const entry = await LibraryEntry.findOne({
      userId: user._id,
      gameSlug: body.slug,
      $or: [{ platform: "desktop" }, { platform: { $exists: false } }, { platform: null }],
    });
    if (!entry) {
      return NextResponse.json({ success: true, deleted: false });
    }

    await entry.deleteOne();
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Library sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
