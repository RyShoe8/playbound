/** Run the real nightly Game Night planner against a throwaway database.
 *
 * Uses the production cluster (MONGODB_URI) but never its database: the
 * planner's models are bound to a freshly named `playbound_nightly_it_*`
 * database, which is dropped at the end. Production is only *read*, to copy a
 * handful of published multiplayer games so eligibility filtering is real.
 *
 * Checks: seven stable events at the configured local time, rerun and
 * concurrent-run idempotency, admin Change Game / Cancel surviving reruns,
 * manual Game Nights owning their date, and three DST changeovers.
 */
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

const TEST_PREFIX = "playbound_nightly_it_";
const TEST_DB = `${TEST_PREFIX}${Date.now()}_${randomBytes(3).toString("hex")}`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error("MONGODB_URI is required");

  // Read-only source for real published games.
  const source = await mongoose.createConnection(uri, { maxPoolSize: 2 }).asPromise();
  const sourceDb = source.db!.databaseName;
  if (sourceDb.startsWith(TEST_PREFIX)) throw new Error("Source is already a test database");
  const games = await source.db!.collection("cataloggames").find({
    published: true, status: "published", playboundSupported: true,
    features: { $in: ["Multiplayer", "Co-op"] },
  }).limit(6).toArray();
  await source.close();
  if (games.length < 3) throw new Error(`Need at least 3 published multiplayer games, found ${games.length}`);

  // Bind the default connection, which the planner's models use, to the test DB.
  await mongoose.connect(uri, { dbName: TEST_DB, maxPoolSize: 5, bufferCommands: false });
  const db = mongoose.connection.db!;
  if (db.databaseName !== TEST_DB || db.databaseName === sourceDb) throw new Error("Refusing: not connected to the isolated database");
  console.log(`isolated database ${TEST_DB} (source ${sourceDb} read-only; ${games.length} games copied)`);

  try {
    const { default: PlatformEvent } = await import("../src/lib/models/PlatformEvent");
    const { default: AutomatedEventConfig } = await import("../src/lib/models/AutomatedEventConfig");
    const { fillNightlySchedule, localDate } = await import("../src/lib/events/nightlySchedule");
    await db.collection("cataloggames").insertMany(games);
    await PlatformEvent.syncIndexes();
    await AutomatedEventConfig.syncIndexes();

    const slugs = games.slice(0, 4).map((g) => String(g.slug));
    async function configure(timezone: string, localTime: string) {
      await PlatformEvent.deleteMany({});
      await AutomatedEventConfig.deleteMany({});
      await AutomatedEventConfig.create({
        key: "global", enabled: false,
        nightly: {
          enabled: true, timezone, localTime, durationHours: 2, horizonDays: 7,
          warmupHours: 4, graceHours: 1,
          weeklyNotification: { enabled: false, weekday: 1, localTime: "10:00" },
          games: slugs.map((slug) => ({ slug, enabled: true, weight: 1, minimumDaysBetweenEvents: 1 })),
        },
      });
    }
    const generated = () => PlatformEvent.find({ generatedBy: "game_night_planner" }).sort({ startsAt: 1 }).lean();
    const localClock = (d: Date, tz: string) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

    // ── 1. Seven stable events, rerun, concurrency, substitutions ──
    {
      const tz = "America/Chicago";
      const now = new Date("2026-09-24T15:00:00Z");
      await configure(tz, "19:00");
      const first = await fillNightlySchedule(now);
      const rows = await generated();
      check("seven events created", first.created === 7 && rows.length === 7, JSON.stringify(first));
      check("all at 19:00 local", rows.every((e) => localClock(new Date(e.startsAt), tz) === "19:00"));
      check("one per local date", new Set(rows.map((e) => localDate(new Date(e.startsAt), tz))).size === 7);
      check("schedule keys match local dates", rows.every((e) => e.scheduleKey === `${localDate(new Date(e.startsAt), tz)}:game_night`));

      const rerun = await fillNightlySchedule(now);
      check("rerun creates none", rerun.created === 0 && (await generated()).length === 7, JSON.stringify(rerun));

      // Admin Change Game on day 2, Cancel on day 3 — as the admin route does.
      const [, changed, cancelled] = rows;
      const newSlug = slugs.find((s) => s !== changed.gameSlug)!;
      await PlatformEvent.updateOne({ _id: changed._id }, { $set: { gameSlug: newSlug, title: "Changed Game Night" } });
      await PlatformEvent.updateOne({ _id: cancelled._id }, { $set: { status: "cancelled" } });
      await fillNightlySchedule(now);
      const after = await PlatformEvent.find({ _id: { $in: [changed._id, cancelled._id] } }).lean();
      const c = after.find((e) => String(e._id) === String(changed._id));
      const x = after.find((e) => String(e._id) === String(cancelled._id));
      check("Change Game survives rerun (same id)", c?.gameSlug === newSlug && c?.title === "Changed Game Night");
      check("Cancel survives rerun, date not refilled", x?.status === "cancelled" && (await generated()).length === 7);

      // Concurrent workers on a fresh schedule.
      await configure(tz, "19:00");
      const results = await Promise.all([fillNightlySchedule(now), fillNightlySchedule(now), fillNightlySchedule(now)]);
      const total = results.reduce((n, r) => n + r.created, 0);
      check("three concurrent runs create exactly seven", total === 7 && (await generated()).length === 7, `created ${total}`);

      // A manual (admin-created) Game Night owns its date.
      await configure(tz, "19:00");
      const manualDay = "2026-09-26";
      await PlatformEvent.create({
        title: "Manual Game Night", eventType: "game_night", gameSlug: slugs[0],
        startsAt: new Date("2026-09-27T00:30:00Z"), endsAt: new Date("2026-09-27T02:30:00Z"),
        timezone: tz, status: "registration_open", visibility: "public", hostType: "playbound",
      });
      await fillNightlySchedule(now);
      const g = await generated();
      check("manual Game Night date is not double-booked",
        g.length === 6 && !g.some((e) => localDate(new Date(e.startsAt), tz) === manualDay), `${g.length} generated`);
    }

    // ── 2. DST changeovers ──
    const dstCases: Array<{ label: string; tz: string; now: string; time: string; change: string }> = [
      { label: "US fall back (Nov 1 2026)", tz: "America/Chicago", now: "2026-10-29T15:00:00Z", time: "19:00", change: "2026-11-01" },
      { label: "EU fall back (Oct 25 2026)", tz: "Europe/London", now: "2026-10-22T09:00:00Z", time: "20:00", change: "2026-10-25" },
      { label: "US spring forward (Mar 14 2027)", tz: "America/Chicago", now: "2027-03-11T15:00:00Z", time: "19:00", change: "2027-03-14" },
    ];
    for (const d of dstCases) {
      await configure(d.tz, d.time);
      const r = await fillNightlySchedule(new Date(d.now));
      const rows = await generated();
      const days = rows.map((e) => localDate(new Date(e.startsAt), d.tz));
      const offsets = new Set(rows.map((e) => new Date(e.startsAt).getUTCHours()));
      check(`${d.label}: seven events`, r.created === 7 && rows.length === 7, JSON.stringify(r));
      check(`${d.label}: every event at ${d.time} local`, rows.every((e) => localClock(new Date(e.startsAt), d.tz) === d.time));
      check(`${d.label}: consecutive local dates incl. ${d.change}`, new Set(days).size === 7 && days.includes(d.change), days.join(","));
      check(`${d.label}: UTC hour shifts across the change`, offsets.size === 2, [...offsets].join(","));
      const rerun = await fillNightlySchedule(new Date(d.now));
      check(`${d.label}: rerun creates none`, rerun.created === 0);
    }
  } finally {
    if (mongoose.connection.db?.databaseName === TEST_DB) {
      await mongoose.connection.db.dropDatabase();
      console.log(`dropped ${TEST_DB}`);
    }
    await mongoose.disconnect();
  }
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  try {
    if (mongoose.connection.db?.databaseName === TEST_DB) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  } catch { /* already closed */ }
  process.exit(1);
});
