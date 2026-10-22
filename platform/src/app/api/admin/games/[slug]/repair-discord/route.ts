import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import { requestDiscordProvision } from "@/lib/discordProvision";
import { deliverGameAnnouncement, queueGameAnnouncement } from "@/lib/discordGameAnnouncement";

export const maxDuration = 120;

/** Explicit repair for a newly published game that missed both Discord actions. */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { slug } = await params;
  await dbConnect();
  const game = await CatalogGame.findOne({ slug, status: "published" })
    .select("slug publishedAt communityLinks discordAnnouncement")
    .lean();
  if (!game) return NextResponse.json({ error: "Published game not found" }, { status: 404 });

  const channel = Boolean(await requestDiscordProvision(slug));
  if (!game.discordAnnouncement?.publishedAt && !game.discordAnnouncement?.sentAt) {
    await queueGameAnnouncement(slug, new Date(game.publishedAt ?? Date.now()));
  }
  const announcement = game.discordAnnouncement?.sentAt ? true : await deliverGameAnnouncement(slug);
  return NextResponse.json({ channel, announcement, ok: channel && announcement });
}
