import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { resolveGameForSync } from "@/lib/catalog";
import { hashLauncherToken } from "@/lib/library";

const batchSchema = z.object({
  installs: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        version: z.string().max(80).optional(),
      })
    )
    .max(100),
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

    return NextResponse.json({ success: true, synced, skipped });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Library batch sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
