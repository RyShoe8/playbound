import dbConnect from "@/lib/db";
import AutomatedEventConfig from "@/lib/models/AutomatedEventConfig";
import PlatformEvent from "@/lib/models/PlatformEvent";
import Notification from "@/lib/models/Notification";
import User from "@/lib/models/User";
import WeeklyScheduleDispatch from "@/lib/models/WeeklyScheduleDispatch";
import { addCalendarDays, instantForLocal, localDate, normalizeNightly } from "./nightlySchedule";
import { postDiscordEventsChannel } from "./discordEventProvision";
import { SITE_URL } from "@/lib/site";

/** One in-app notice per user after all seven evenings are actually published. */
export async function sendWeeklyScheduleNotification(now = new Date()): Promise<{ sent: number; reason?: string }> {
  await dbConnect();
  const config = await AutomatedEventConfig.findOne({ key: "global" }).select({ nightly: 1 }).lean();
  if (!config?.nightly?.enabled || !config.nightly.weeklyNotification?.enabled) return { sent: 0, reason: "disabled" };
  const nightly = normalizeNightly(config.nightly);
  const day = localDate(now, nightly.timezone);
  if (new Date(`${day}T00:00:00Z`).getUTCDay() !== nightly.weeklyNotification.weekday) return { sent: 0, reason: "wrong_day" };
  const target = instantForLocal(day, nightly.weeklyNotification.localTime, nightly.timezone);
  if (!target || now < target || now.getTime() >= target.getTime() + 86_400_000) return { sent: 0, reason: "outside_window" };
  const expectedDays = new Set(Array.from({ length: 7 }, (_, i) => addCalendarDays(day, i)));
  const nights = await PlatformEvent.find({
    eventType: "game_night", visibility: "public", status: { $nin: ["cancelled", "draft"] },
    startsAt: { $gte: new Date(`${addCalendarDays(day, -1)}T00:00:00Z`), $lt: new Date(`${addCalendarDays(day, 8)}T00:00:00Z`) },
  }).select({ title: 1, gameSlug: 1, startsAt: 1 }).sort({ startsAt: 1 }).lean();
  const publishedDays = new Set(nights.map((night) => localDate(new Date(night.startsAt), nightly.timezone)));
  if ([...expectedDays].some((date) => !publishedDays.has(date))) return { sent: 0, reason: "schedule_incomplete" };
  const dedupeKey = `game-night-week:${day}`;
  let claim;
  try {
    claim = await WeeklyScheduleDispatch.findOneAndUpdate(
      { key: dedupeKey, completedAt: null, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] },
      { $set: { leaseUntil: new Date(now.getTime() + 5 * 60_000) }, $setOnInsert: { key: dedupeKey } },
      { upsert: true, new: true }
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return { sent: 0, reason: "already_claimed" };
    throw error;
  }
  if (!claim) return { sent: 0, reason: "already_claimed" };
  let sent = 0;
  const users = User.find({ disabled: { $ne: true }, needsUsername: { $ne: true } }).select({ _id: 1 }).lean().cursor();
  const batch: Array<Promise<number>> = [];
  async function drain() {
    sent += (await Promise.all(batch)).reduce((total, count) => total + count, 0);
    batch.length = 0;
  }
  for await (const user of users) {
    batch.push(Notification.updateOne(
      { userId: user._id, dedupeKey },
      { $setOnInsert: {
        userId: user._id, dedupeKey, type: "game_night_weekly_schedule",
        title: "This week's Game Nights are ready",
        body: "See the seven games on the PlayBound Events calendar and join one that sounds fun.",
        href: "/events",
      } },
      { upsert: true }
    ).then((result) => result.upsertedCount || 0).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) return 0;
      throw error;
    }));
    if (batch.length >= 25) await drain();
  }
  if (batch.length) await drain();
  await WeeklyScheduleDispatch.updateOne({ key: dedupeKey }, { $set: { completedAt: new Date(), sent }, $unset: { leaseUntil: "" } });

  // Post announcement to Discord #events channel
  const scheduleLines = nights.map((night) => {
    const dateStr = new Date(night.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: nightly.timezone });
    return `• **${dateStr}**: ${night.title}`;
  }).join("\n");

  await postDiscordEventsChannel({
    title: "🗓️ This Week's Game Nights Schedule",
    description: `The upcoming week of PlayBound Game Nights is scheduled!\n\n${scheduleLines}\n\n🎟️ **[View Event Calendar & RSVP](${SITE_URL}/events)**`,
    url: `${SITE_URL}/events`,
  }).catch((err) => {
    console.warn("[weekly-schedule] discord announce failed:", err);
  });

  return { sent };
}
