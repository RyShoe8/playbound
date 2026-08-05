/**
 * Shared day / week / month windows for admin KPI dashboards.
 */

import dbConnect from "@/lib/db";

export type PeriodWindows = {
  now: Date;
  today: Date;
  yesterday: Date;
  d7: Date;
  d14: Date;
  d30: Date;
  d60: Date;
};

export type PeriodCounts = {
  day: number;
  week: number;
  month: number;
  dayPrev: number;
  weekPrev: number;
  monthPrev: number;
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysAgo(n: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export function getPeriodWindows(now = new Date()): PeriodWindows {
  const today = startOfDay(now);
  return {
    now,
    today,
    yesterday: daysAgo(1, now),
    d7: daysAgo(7, now),
    d14: daysAgo(14, now),
    d30: daysAgo(30, now),
    d60: daysAgo(60, now),
  };
}

export function emptyPeriodCounts(): PeriodCounts {
  return { day: 0, week: 0, month: 0, dayPrev: 0, weekPrev: 0, monthPrev: 0 };
}

export function addPeriodCounts(a: PeriodCounts, b: PeriodCounts): PeriodCounts {
  return {
    day: a.day + b.day,
    week: a.week + b.week,
    month: a.month + b.month,
    dayPrev: a.dayPrev + b.dayPrev,
    weekPrev: a.weekPrev + b.weekPrev,
    monthPrev: a.monthPrev + b.monthPrev,
  };
}

type Countable = {
  countDocuments: (filter: Record<string, unknown>) => Promise<number> | number;
};

/**
 * Count documents with a `createdAt` field across today / 7d / 30d and prior windows.
 *
 * Ensures the database connection itself, rather than assuming the caller got
 * there first. Every caller passes a Mongoose model, and these are routinely
 * invoked inside a Promise.all where ordering is not guaranteed — with
 * bufferCommands:false that raced the connection and failed on cold starts.
 * dbConnect() is cached, so this costs nothing once connected.
 */
export async function periodDocumentCounts(
  model: Countable,
  baseFilter: Record<string, unknown> = {}
): Promise<PeriodCounts> {
  await dbConnect();
  const w = getPeriodWindows();
  const count = async (createdAt: Record<string, Date>) =>
    Number(await model.countDocuments({ ...baseFilter, createdAt }));

  const [day, week, month, dayPrev, weekPrev, monthPrev] = await Promise.all([
    count({ $gte: w.today }),
    count({ $gte: w.d7 }),
    count({ $gte: w.d30 }),
    count({ $gte: w.yesterday, $lt: w.today }),
    count({ $gte: w.d14, $lt: w.d7 }),
    count({ $gte: w.d60, $lt: w.d30 }),
  ]);

  return { day, week, month, dayPrev, weekPrev, monthPrev };
}

/**
 * Count TelemetryEvent rows, optionally filtered by event name(s).
 */
export async function periodTelemetryCounts(
  TelemetryEvent: Countable,
  event?: string | string[],
  extraFilter: Record<string, unknown> = {}
): Promise<PeriodCounts> {
  const base: Record<string, unknown> = { ...extraFilter };
  if (typeof event === "string") base.event = event;
  else if (Array.isArray(event)) base.event = { $in: event };
  return periodDocumentCounts(TelemetryEvent, base);
}

/**
 * Distinct identified userIds with any telemetry in each window.
 */
export async function periodDistinctUsers(
  distinctFn: (filter: Record<string, unknown>) => Promise<unknown[]>
): Promise<PeriodCounts> {
  // Same cold-start race as periodDocumentCounts — the caller's distinctFn
  // closes over a Mongoose model that needs a live connection.
  await dbConnect();
  const w = getPeriodWindows();
  const run = async (createdAt: Record<string, Date>) => {
    const ids = await distinctFn({
      createdAt,
      userId: { $nin: [null, ""] },
    });
    return ids.length;
  };

  const [day, week, month, dayPrev, weekPrev, monthPrev] = await Promise.all([
    run({ $gte: w.today }),
    run({ $gte: w.d7 }),
    run({ $gte: w.d30 }),
    run({ $gte: w.yesterday, $lt: w.today }),
    run({ $gte: w.d14, $lt: w.d7 }),
    run({ $gte: w.d60, $lt: w.d30 }),
  ]);

  return { day, week, month, dayPrev, weekPrev, monthPrev };
}
