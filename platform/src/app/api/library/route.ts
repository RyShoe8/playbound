import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { getGame } from "@/lib/catalog";
import type { LibraryEntryDTO } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import {
  isLibraryPlatform,
  platformFromRequest,
  visiblePlatformsFor,
} from "@/lib/libraryPlatform";

function toDto(doc: {
  gameSlug: string;
  saved?: boolean;
  installed: boolean;
  version?: string | null;
  installedAt?: Date | null;
  addedAt: Date;
}): LibraryEntryDTO {
  return {
    gameSlug: doc.gameSlug,
    saved: Boolean(doc.saved) && !doc.installed,
    installed: Boolean(doc.installed),
    version: doc.version ?? null,
    installedAt: doc.installedAt ? new Date(doc.installedAt).toISOString() : null,
    addedAt: new Date(doc.addedAt).toISOString(),
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const platform = platformFromRequest(req);
    const visible = visiblePlatformsFor(platform);

    const all = await LibraryEntry.find({
      userId: session.user.id,
      $or: [{ installed: true }, { saved: true }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    // Entries written before `platform` existed came from the launcher, so
    // they are desktop — matching what the migration backfills.
    const platformOf = (r: { platform?: string }) =>
      isLibraryPlatform(r.platform) ? r.platform : "desktop";

    const rows = all.filter((r) => visible.includes(platformOf(r)));

    // Games owned elsewhere are not shown, but the count is returned so the
    // library can say so — otherwise a desktop user whose games are all on
    // their phone sees an empty page with no explanation.
    const elsewhere: Record<string, number> = {};
    for (const r of all) {
      const p = platformOf(r);
      if (visible.includes(p)) continue;
      elsewhere[p] = (elsewhere[p] ?? 0) + 1;
    }

    return NextResponse.json({
      entries: rows.map(toDto),
      platform,
      otherPlatforms: elsewhere,
    });
  } catch (error) {
    console.error("Library list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const addSchema = z.object({
  slug: z.string().min(1).max(80),
  /** install = claim as owned; save = keep for later (e.g. wrong device). */
  intent: z.enum(["install", "save"]).optional().default("install"),
  /**
   * How the claim arose. `store_redirect` means we sent the user to an app
   * store and are assuming they followed through — we never find out for
   * certain, so it is recorded as a weaker signal than a launcher install.
   */
  source: z.enum(["store_redirect", "browser", "manual"]).optional().default("manual"),
});

/** Manually claim a catalog game as owned, or save for later on another device. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { slug, intent, source } = addSchema.parse(await req.json());
    const game = await getGame(slug);
    if (!game) {
      return NextResponse.json({ error: "Unknown game" }, { status: 404 });
    }

    await dbConnect();
    const now = new Date();
    const saving = intent === "save";

    /**
     * Derived from the User-Agent rather than taken from the client, so a
     * request cannot put a game in the wrong device's library. Browser games
     * are filed under "web" whatever the device, since they need no install
     * and run everywhere.
     */
    const platform = game.browserPlayable ? "web" : platformFromRequest(req);

    const entry = await LibraryEntry.findOneAndUpdate(
      { userId: session.user.id, gameSlug: slug, platform },
      {
        $set: saving
          ? {
              saved: true,
              updatedAt: now,
            }
          : {
              installed: true,
              saved: false,
              updatedAt: now,
              installedAt: now,
            },
        $setOnInsert: {
          userId: session.user.id,
          gameSlug: slug,
          platform,
          source,
          addedAt: now,
          ...(saving ? { installed: false } : {}),
        },
      },
      { upsert: true, new: true }
    ).lean();

    if (!saving) {
      void saveEvent({
        event: "game_installed",
        properties: {
          gameSlug: slug,
          gameTitle: game.title,
          // Distinguishes an assumed store install from a confirmed launcher
          // one, so install counts can be read honestly.
          installMethod: source === "store_redirect" ? "mobile_store" : "manual_claim",
          platform,
          source,
        },
        userId: session.user.id,
        timestamp: now.toISOString(),
        userAgent: req.headers.get("user-agent"),
      }).catch(() => undefined);
    }

    return NextResponse.json({ entry: toDto(entry!) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Library add error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    await dbConnect();

    // Scoped to the device making the request: removing a game from your phone
    // must not also remove the desktop copy you still have installed.
    // `?allPlatforms=1` is the deliberate opt-out for "remove everywhere".
    const allPlatforms = url.searchParams.get("allPlatforms") === "1";
    const filter: Record<string, unknown> = { userId: session.user.id, gameSlug: slug };
    if (!allPlatforms) {
      const platform = platformFromRequest(req);
      // Legacy entries have no platform and are desktop by definition, so a
      // desktop delete must match them too or they become unremovable.
      filter.$or =
        platform === "desktop"
          ? [{ platform: "desktop" }, { platform: { $exists: false } }, { platform: null }]
          : [{ platform }, { platform: "web" }];
    }

    const res = await LibraryEntry.deleteMany(filter);
    return NextResponse.json({ success: true, deleted: res.deletedCount > 0 });
  } catch (error) {
    console.error("Library remove error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
