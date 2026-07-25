import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { getGame } from "@/lib/catalog";
import { hashLauncherToken } from "@/lib/library";

const syncSchema = z.object({
  slug: z.string().min(1).max(80),
  action: z.enum(["install", "uninstall"]),
  version: z.string().max(80).optional(),
});

async function userFromBearer(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;
  const tokenHash = hashLauncherToken(match[1].trim());
  await dbConnect();
  return User.findOne({ launcherTokenHash: tokenHash }).select("+launcherTokenHash _id");
}

export async function POST(req: Request) {
  try {
    const user = await userFromBearer(req);
    if (!user) {
      return NextResponse.json({ error: "Invalid or missing launcher token" }, { status: 401 });
    }

    const body = syncSchema.parse(await req.json());
    if (!(await getGame(body.slug))) {
      return NextResponse.json({ error: "Unknown game" }, { status: 404 });
    }

    await dbConnect();
    const now = new Date();

    if (body.action === "install") {
      const entry = await LibraryEntry.findOneAndUpdate(
        { userId: user._id, gameSlug: body.slug },
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
            saved: false,
            addedAt: now,
          },
        },
        { upsert: true, new: true }
      );
      return NextResponse.json({
        success: true,
        gameSlug: entry.gameSlug,
        installed: true,
        saved: entry.saved,
      });
    }

    const entry = await LibraryEntry.findOne({ userId: user._id, gameSlug: body.slug });
    if (!entry) {
      return NextResponse.json({ success: true, deleted: false });
    }

    if (entry.saved) {
      entry.installed = false;
      entry.version = undefined;
      entry.installedAt = undefined;
      entry.updatedAt = now;
      await entry.save();
      return NextResponse.json({ success: true, installed: false, saved: true });
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
