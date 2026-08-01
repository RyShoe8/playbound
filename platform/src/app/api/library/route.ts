import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { getGame } from "@/lib/catalog";
import type { LibraryEntryDTO } from "@/lib/library";

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
    saved: false,
    installed: Boolean(doc.installed),
    version: doc.version ?? null,
    installedAt: doc.installedAt ? new Date(doc.installedAt).toISOString() : null,
    addedAt: new Date(doc.addedAt).toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    // Wishlist removed — library is owned/installed games only.
    await LibraryEntry.deleteMany({
      userId: session.user.id,
      installed: { $ne: true },
      saved: true,
    });
    const rows = await LibraryEntry.find({
      userId: session.user.id,
      installed: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ entries: rows.map(toDto) });
  } catch (error) {
    console.error("Library list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const addSchema = z.object({
  slug: z.string().min(1).max(80),
});

/** Manually claim a catalog game as owned (installed) without a launcher path. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { slug } = addSchema.parse(await req.json());
    if (!(await getGame(slug))) {
      return NextResponse.json({ error: "Unknown game" }, { status: 404 });
    }

    await dbConnect();
    const now = new Date();
    const entry = await LibraryEntry.findOneAndUpdate(
      { userId: session.user.id, gameSlug: slug },
      {
        $set: {
          installed: true,
          saved: false,
          updatedAt: now,
          installedAt: now,
        },
        $setOnInsert: {
          userId: session.user.id,
          gameSlug: slug,
          addedAt: now,
        },
      },
      { upsert: true, new: true }
    ).lean();

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

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    await dbConnect();
    await LibraryEntry.deleteOne({ userId: session.user.id, gameSlug: slug });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Library remove error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
