import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import PlatformEvent from "@/lib/models/PlatformEvent";
import AutomatedEventConfig, {
  type NightlyGameConfig,
  type NightlyScheduleConfig,
} from "@/lib/models/AutomatedEventConfig";

export const DEFAULT_NIGHTLY: NightlyScheduleConfig = {
  enabled: false,
  timezone: "America/Chicago",
  localTime: "19:00",
  durationHours: 2,
  horizonDays: 7,
  warmupHours: 4,
  graceHours: 1,
  weeklyNotification: { enabled: false, weekday: 1, localTime: "10:00" },
  games: [],
};

export function validTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const localFormatters = new Map<string, Intl.DateTimeFormat>();

function localParts(instant: Date, timezone: string) {
  let formatter = localFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    localFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function localDate(instant: Date, timezone: string): string {
  const p = localParts(instant, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addCalendarDays(day: string, count: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

/** Earliest matching instant on a repeated DST hour; null for a skipped hour. */
export function instantForLocal(day: string, time: string, timezone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !validTimezone(timezone)) {
    return null;
  }
  const nominal = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  // UTC offset spans -12 through +14 hours. Search in minute increments to
  // handle half-hour offsets and DST gaps/folds without relying on server TZ.
  for (let delta = -14 * 60; delta <= 12 * 60; delta++) {
    const candidate = new Date(nominal + delta * 60_000);
    const p = localParts(candidate, timezone);
    if (`${p.year}-${p.month}-${p.day}` === day && `${p.hour}:${p.minute}` === time) return candidate;
  }
  return null;
}

/** A DST spring gap uses the first available minute later that same local day. */
export function nightlyInstant(day: string, time: string, timezone: string): Date | null {
  const direct = instantForLocal(day, time, timezone);
  if (direct) return direct;
  const [hour, minute] = time.split(":").map(Number);
  for (let offset = 1; offset <= 120; offset++) {
    const next = hour * 60 + minute + offset;
    if (next >= 24 * 60) break;
    const candidate = instantForLocal(day, `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`, timezone);
    if (candidate) return candidate;
  }
  return null;
}

export function chooseNightlyGame(
  day: string,
  games: NightlyGameConfig[],
  recent: { slug: string; editionSlug?: string | null; day: string }[]
): NightlyGameConfig | null {
  const candidates = games.filter((g) => g.enabled && g.slug && g.weight >= 1);
  const eligible = candidates.map((game) => {
    const previous = recent
      .filter((r) => r.slug === game.slug && (r.editionSlug || null) === (game.editionSlug || null) && r.day < day)
      .map((r) => r.day)
      .sort()
      .at(-1);
    const gap = previous ? Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000) : 10_000;
    return { game, gap };
  }).filter(({ game, gap }) => gap >= game.minimumDaysBetweenEvents);
  eligible.sort((a, b) => (b.gap * b.game.weight) - (a.gap * a.game.weight) || a.game.slug.localeCompare(b.game.slug));
  return eligible[0]?.game ?? null;
}

export function normalizeNightly(input: NightlyScheduleConfig): NightlyScheduleConfig {
  if (!validTimezone(input.timezone)) throw new Error("Invalid IANA timezone");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.localTime)) throw new Error("Time must be HH:mm");
  if (!Number.isFinite(input.durationHours) || input.durationHours < 0.5 || input.durationHours > 24) throw new Error("Invalid duration");
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 14) throw new Error("Invalid horizon");
  const warmupHours = input.warmupHours ?? 4;
  const graceHours = input.graceHours ?? 1;
  const weekly = input.weeklyNotification ?? DEFAULT_NIGHTLY.weeklyNotification;
  if (!Number.isFinite(warmupHours) || warmupHours < 1 || warmupHours > 24 || !Number.isFinite(graceHours) || graceHours < 0 || graceHours > 24) throw new Error("Invalid warmup or grace period");
  if (!Number.isInteger(weekly.weekday) || weekly.weekday < 0 || weekly.weekday > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(weekly.localTime)) throw new Error("Invalid weekly notification timing");
  if (weekly.enabled && input.horizonDays < 7) throw new Error("Weekly notification requires a seven-day schedule");
  const seen = new Set<string>();
  const games = input.games.map((g) => {
    const key = `${g.slug}:${g.editionSlug || ""}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(g.slug) || seen.has(key)) throw new Error("Invalid or duplicate game");
    if (g.editionSlug && !/^[a-z0-9][a-z0-9-]*$/.test(g.editionSlug)) throw new Error("Invalid edition");
    if (!Number.isInteger(g.weight) || g.weight < 1 || g.weight > 100) throw new Error("Invalid weight");
    if (!Number.isInteger(g.minimumDaysBetweenEvents) || g.minimumDaysBetweenEvents < 0 || g.minimumDaysBetweenEvents > 365) throw new Error("Invalid minimum-days setting");
    seen.add(key);
    return { slug: g.slug, editionSlug: g.editionSlug || null, enabled: Boolean(g.enabled), weight: g.weight, minimumDaysBetweenEvents: g.minimumDaysBetweenEvents };
  });
  if (input.enabled && !games.some((g) => g.enabled)) throw new Error("Enable at least one game before scheduling");
  if (input.enabled) {
    const simulated: { slug: string; editionSlug?: string | null; day: string }[] = [];
    for (let offset = 0; offset < input.horizonDays; offset++) {
      const day = addCalendarDays("2030-01-01", offset);
      const selected = chooseNightlyGame(day, games, simulated);
      if (!selected) throw new Error("This game rotation cannot fill every evening; add games or reduce minimum days between repeats");
      simulated.push({ slug: selected.slug, editionSlug: selected.editionSlug, day });
    }
  }
  return { enabled: Boolean(input.enabled), timezone: input.timezone, localTime: input.localTime, durationHours: input.durationHours, horizonDays: input.horizonDays, warmupHours, graceHours, weeklyNotification: { enabled: Boolean(weekly.enabled), weekday: weekly.weekday, localTime: weekly.localTime }, games };
}

export async function fillNightlySchedule(now = new Date()): Promise<{ created: number; skipped: number; reason?: string }> {
  await dbConnect();
  const config = await AutomatedEventConfig.findOne({ key: "global" }).lean();
  const nightly = config?.nightly ? normalizeNightly(config.nightly) : DEFAULT_NIGHTLY;
  if (!nightly.enabled) return { created: 0, skipped: 0, reason: "disabled" };
  // The legacy pop-up system must be cut over before nightly generation starts.
  if (config?.enabled) return { created: 0, skipped: 0, reason: "legacy_popups_enabled" };
  const slugs = [...new Set(nightly.games.filter((g) => g.enabled).map((g) => g.slug))];
  const published = await CatalogGame.find({
    slug: { $in: slugs }, published: true, status: "published", playboundSupported: true,
    features: { $in: ["Multiplayer", "Co-op"] },
  })
    .select({ slug: 1, title: 1, coverImage: 1 }).lean();
  const bySlug = new Map(published.map((g) => [g.slug, g]));
  const games = nightly.games.filter((g) => bySlug.has(g.slug));
  const today = localDate(now, nightly.timezone);
  const end = addCalendarDays(today, nightly.horizonDays);
  const existing = await PlatformEvent.find({
    generatedBy: "game_night_planner",
    scheduleKey: { $gte: `${today}:`, $lt: `${end}:` },
  }).select({ gameSlug: 1, editionSlug: 1, scheduleKey: 1 }).lean();
  // Legacy pop-ups or admin-created Game Nights already on the calendar own
  // their date. Do not publish a second event while the cutover completes.
  const scheduledNights = await PlatformEvent.find({
    eventType: "game_night", status: { $ne: "cancelled" }, visibility: "public",
    startsAt: { $gte: new Date(`${addCalendarDays(today, -1)}T00:00:00Z`), $lt: new Date(`${addCalendarDays(end, 1)}T00:00:00Z`) },
  }).select({ startsAt: 1, gameSlug: 1, editionSlug: 1 }).lean();
  const occupiedDays = new Set(scheduledNights.map((e) => localDate(new Date(e.startsAt), nightly.timezone)));
  const historyStart = addCalendarDays(today, -Math.max(365, nightly.horizonDays));
  const history = await PlatformEvent.find({
    eventType: "game_night", gameSlug: { $in: slugs }, status: { $ne: "cancelled" },
    startsAt: { $gte: new Date(`${historyStart}T00:00:00Z`), $lt: now },
  }).select({ gameSlug: 1, editionSlug: 1, startsAt: 1 }).lean();
  const recent = history.filter((e) => e.gameSlug).map((e) => ({
    slug: e.gameSlug as string, editionSlug: e.editionSlug as string | null,
    day: localDate(new Date(e.startsAt), nightly.timezone),
  }));
  recent.push(...existing.filter((e) => e.gameSlug && e.scheduleKey).map((e) => ({
    slug: e.gameSlug as string, editionSlug: e.editionSlug as string | null, day: String(e.scheduleKey).slice(0, 10),
  })));
  recent.push(...scheduledNights.filter((e) => e.gameSlug).map((e) => ({
    slug: e.gameSlug as string, editionSlug: e.editionSlug as string | null,
    day: localDate(new Date(e.startsAt), nightly.timezone),
  })));
  let created = 0;
  let skipped = 0;
  for (let offset = 0; offset < nightly.horizonDays; offset++) {
    const day = addCalendarDays(today, offset);
    const key = `${day}:game_night`;
    if (existing.some((e) => e.scheduleKey === key)) continue;
    if (occupiedDays.has(day)) { skipped++; continue; }
    const startsAt = nightlyInstant(day, nightly.localTime, nightly.timezone);
    if (!startsAt || startsAt <= now) { skipped++; continue; }
    const selected = chooseNightlyGame(day, games, recent);
    if (!selected) { skipped++; continue; }
    const game = bySlug.get(selected.slug)!;
    let inserted = false;
    try {
      const result = await PlatformEvent.updateOne(
        { scheduleKey: key },
        { $setOnInsert: {
        scheduleKey: key, generatedBy: "game_night_planner",
        title: `${game.title} Game Night`, eventType: "game_night", gameSlug: selected.slug,
        editionSlug: selected.editionSlug || null, coverImage: game.coverImage || null,
        startsAt, endsAt: new Date(startsAt.getTime() + nightly.durationHours * 3_600_000),
        timezone: nightly.timezone, status: "registration_open", visibility: "public",
        hostType: "playbound", publishedAt: now,
        } },
        { upsert: true }
      );
      inserted = result.upsertedCount > 0;
    } catch (error) {
      // Another cron worker may win the unique scheduleKey upsert race.
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw error;
    }
    if (inserted) {
      created++;
      recent.push({ slug: selected.slug, editionSlug: selected.editionSlug || null, day });
    }
  }
  return { created, skipped };
}
