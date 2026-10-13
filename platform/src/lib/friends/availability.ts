export type Availability = { timezone: string; window: { startsAt: string; endsAt: string } | null; weekly: { day: number; startMinute: number; endMinute: number }[]; publishLooking?: boolean };
export const emptyAvailability = (timezone = "UTC"): Availability => ({ timezone, window: null, weekly: [] });
const formatters = new Map<string, Intl.DateTimeFormat>();
export function scheduledLookingEnd(availability: Availability, now = Date.now()): number | null {
  if (!availability.publishLooking || !availableAt(availability, now)) return null;
  if (!availability.weekly.length && availability.window) return Date.parse(availability.window.endsAt);
  let end = Math.floor(now / 60_000) * 60_000 + 15 * 60_000;
  while (end < now + 48 * 3600_000 && availableAt(availability, end)) end += 15 * 60_000;
  let boundary = Math.max(now, end - 15 * 60_000);
  while (boundary < end && availableAt(availability, boundary)) boundary += 60_000;
  return boundary;
}

export function availableAt(availability: Availability, time: number): boolean {
  if (availability.window && Date.parse(availability.window.startsAt) <= time && time < Date.parse(availability.window.endsAt)) return true;
  if (!availability.weekly.length) return false;
  let formatter = formatters.get(availability.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: availability.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (formatters.size > 64) formatters.clear();
    formatters.set(availability.timezone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  return availability.weekly.some(slot => slot.day === day && minute >= slot.startMinute && minute < slot.endMinute);
}

/** Scan real instants, then compare local wall time: timezone and DST changes stay local to each person. */
export function commonAvailability(people: Availability[], now = Date.now(), durationMinutes = 60) {
  if (!people.length) return [];
  const step = 60_000, duration = durationMinutes * 60_000;
  const start = Math.ceil(now / step) * step, horizon = now + 7 * 86400_000;
  const slots: { startsAt: string; endsAt: string }[] = [];
  let runStart: number | null = null;
  for (let time = start; time <= horizon; time += step) {
    const available = time < horizon && people.every(person => availableAt(person, time) && availableAt(person, time + step - 1));
    if (available && runStart === null) runStart = time;
    if (!available && runStart !== null) {
      if (time - runStart >= duration) slots.push({ startsAt: new Date(runStart).toISOString(), endsAt: new Date(time).toISOString() });
      runStart = null;
    }
  }
  return slots;
}
