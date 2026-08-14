import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { gamesFor, getGame } from "@/lib/catalog";
import type { LibraryEntryDTO } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { platformFromRequest } from "@/lib/libraryPlatform";
import { buildLibraryUnionEntries } from "@/lib/libraryUnion";

function toDto(entry: {
  gameSlug: string;
  saved: boolean;
  installed: boolean;
  ownedElsewhere?: boolean;
  version?: string | null;
  installedAt?: string | null;
  addedAt?: string;
}): LibraryEntryDTO {
  return {
    gameSlug: entry.gameSlug,
    saved: entry.saved,
    installed: entry.installed,
    ownedElsewhere: Boolean(entry.ownedElsewhere),
    version: entry.version ?? null,
    installedAt: entry.installedAt ?? null,
    addedAt: entry.addedAt ?? new Date(0).toISOString(),
  };
}

function docToDto(doc: {
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

    const all = await LibraryEntry.find({
      userId: session.user.id,
      $or: [{ installed: true }, { saved: true }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    const candidateSlugs = [...new Set(all.map((r) => String(r.gameSlug)))];
    const catalogGames = await gamesFor(candidateSlugs, { includeUnpublished: true });
    const gamesBySlug = new Map(catalogGames.map((g) => [g.slug, g]));

    const { entries, hiddenElsewhereCount } = buildLibraryUnionEntries(
      all.map((r) => ({
        gameSlug: String(r.gameSlug),
        platform: r.platform as string | undefined,
        installed: Boolean(r.installed),
        saved: Boolean(r.saved),
      })),
      gamesBySlug,
      platform
    );

    const addedBySlug = new Map(
      all.map((r) => [String(r.gameSlug), new Date(r.addedAt).toISOString()])
    );

    return NextResponse.json({
      entries: entries.map((e) =>
        toDto({
          ...e,
          addedAt: addedBySlug.get(e.gameSlug),
        })
      ),
      platform,
      hiddenElsewhereCount,
      otherPlatforms: { count: hiddenElsewhereCount },
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
    // Allow claiming testing/CMS drafts the user can already open (admins/testers).
    const game = await getGame(slug, { includeUnpublished: true });
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

    const existing = await LibraryEntry.findOne({
      userId: session.user.id,
      gameSlug: slug,
      platform,
    })
      .select("installed")
      .lean();
    const alreadyInstalled = Boolean(existing?.installed);

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
      { upsert: true, returnDocument: "after" }
    ).lean();

    // First install on this platform only. Store / browser claims also emit
    // `game_installed` from MobileOutboundCta (keepalive) so analytics survive
    // Play Store navigation — skip those sources here to avoid double counts.
    if (!saving && !alreadyInstalled && source === "manual") {
      void saveEvent({
        event: "game_installed",
        properties: {
          gameSlug: slug,
          gameTitle: game.title,
          installMethod: "manual_claim",
          platform,
          source,
        },
        userId: session.user.id,
        timestamp: now.toISOString(),
        userAgent: req.headers.get("user-agent"),
      }).catch(() => undefined);
    }

    return NextResponse.json({ entry: docToDto(entry!) }, { status: 201 });
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
