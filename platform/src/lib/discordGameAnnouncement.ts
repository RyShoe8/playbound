import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { IS_PRODUCTION } from "@/lib/site";
import { requestNewGameDiscordAnnounce } from "@/lib/discordProvision";

/** Queue only a real publication transition. An ordinary edit must not reannounce a game. */
export async function queueGameAnnouncement(slug: string, publishedAt: Date): Promise<void> {
  if (!IS_PRODUCTION) return;
  await dbConnect();
  await CatalogGame.updateOne(
    { slug, status: "published" },
    { $set: { discordAnnouncement: { publishedAt, sentAt: null, lastAttemptAt: null } } }
  );
}

/** A failed bot call leaves the row pending for the scheduled retry. */
export async function deliverGameAnnouncement(slug: string): Promise<boolean> {
  if (!IS_PRODUCTION) return false;
  await dbConnect();
  const game = await CatalogGame.findOne({
    slug,
    status: "published",
    "discordAnnouncement.publishedAt": { $ne: null },
    "discordAnnouncement.sentAt": null,
  })
    .select("slug title thatOneThing tagline coverImage screenshots discordAnnouncement")
    .lean();
  if (!game?.discordAnnouncement?.publishedAt) return false;

  const publication = game.discordAnnouncement.publishedAt;
  await CatalogGame.updateOne(
    { slug, "discordAnnouncement.publishedAt": publication, "discordAnnouncement.sentAt": null },
    { $set: { "discordAnnouncement.lastAttemptAt": new Date() } }
  );
  const sent = await requestNewGameDiscordAnnounce({ ...game, publicationAt: publication });
  if (sent) {
    await CatalogGame.updateOne(
      { slug, "discordAnnouncement.publishedAt": publication, "discordAnnouncement.sentAt": null },
      { $set: { "discordAnnouncement.sentAt": new Date() } }
    );
  }
  return sent;
}

/** Only explicitly queued publications are retried, so old catalog games are never blasted to #general. */
export async function retryPendingGameAnnouncements(limit = 2): Promise<{ attempted: number; sent: number }> {
  if (!IS_PRODUCTION) return { attempted: 0, sent: 0 };
  await dbConnect();
  const pending = await CatalogGame.find({
    status: "published",
    "discordAnnouncement.publishedAt": { $ne: null },
    "discordAnnouncement.sentAt": null,
  })
    .select("slug")
    .sort({ "discordAnnouncement.lastAttemptAt": 1, "discordAnnouncement.publishedAt": 1 })
    .limit(limit)
    .lean();
  let sent = 0;
  for (const game of pending) {
    if (await deliverGameAnnouncement(game.slug)) sent += 1;
  }
  return { attempted: pending.length, sent };
}
