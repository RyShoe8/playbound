import { localDate } from "./nightlySchedule";

/** The UTC query includes timezone padding; only local dates in the advertised week belong in the post. */
export function eventsInWeeklySchedule<T extends { startsAt: Date }>(
  events: T[],
  expectedDays: ReadonlySet<string>,
  timezone: string
): T[] {
  return events.filter((event) => expectedDays.has(localDate(new Date(event.startsAt), timezone)));
}
