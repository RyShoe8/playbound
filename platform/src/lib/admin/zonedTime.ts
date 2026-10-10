/**
 * Timezone-aware day boundaries for admin reports.
 *
 * Everything is stored in UTC. A report's "today" and its date filters,
 * however, mean the admin's calendar day, so the server needs the viewer's
 * zone. The browser supplies it (cookie `pb_admin_tz` / the `tz` form field);
 * UTC is the fallback so the result is always defined.
 */

export const ADMIN_TZ_COOKIE = "pb_admin_tz";

/** Returns a valid IANA zone, or "UTC" for anything missing or unknown. */
export function normalizeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Minutes-from-UTC style offset (ms) of `tz` at the given instant. */
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant at which calendar day y-m-d begins in `tz`. */
function dayStartUtc(y: number, m: number, d: number, tzIn: string): Date {
  const tz = normalizeTimeZone(tzIn);
  const guess = Date.UTC(y, m - 1, d);
  let result = guess - offsetMs(guess, tz);
  // One more pass: the offset at the corrected instant can differ across a DST change.
  result = guess - offsetMs(result, tz);
  return new Date(result);
}

/** Parses `YYYY-MM-DD`; null if it is not a real calendar date. */
function parseDateOnly(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Start of the given calendar day (`YYYY-MM-DD`) in `tz`, or null. */
export function zonedDateStart(value: string, tz: string): Date | null {
  const p = parseDateOnly(value);
  return p ? dayStartUtc(p.y, p.m, p.d, tz) : null;
}

/** Start of the calendar day AFTER the given day in `tz` — an exclusive upper bound. */
export function zonedDateEndExclusive(value: string, tz: string): Date | null {
  const p = parseDateOnly(value);
  if (!p) return null;
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return dayStartUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
}

/** Start of the calendar day containing `now` in `tz`. */
export function zonedStartOfToday(now: Date, tz: string): Date {
  const zone = normalizeTimeZone(tz);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA → YYYY-MM-DD
  return zonedDateStart(parts, zone) ?? new Date(now);
}

/** Start of the calendar day `n` days before today in `tz`. */
export function zonedDaysAgo(n: number, now: Date, tz: string): Date {
  const zone = normalizeTimeZone(tz);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const p = parseDateOnly(today);
  if (!p) return new Date(now);
  const back = new Date(Date.UTC(p.y, p.m - 1, p.d - n));
  return dayStartUtc(back.getUTCFullYear(), back.getUTCMonth() + 1, back.getUTCDate(), zone);
}
