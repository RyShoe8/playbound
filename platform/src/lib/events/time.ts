/**
 * Format event times for display. Store UTC dates; render in user / event TZ.
 */

export function formatEventWhen(
  startsAt: Date | string,
  opts?: { timezone?: string | null; endsAt?: Date | string | null; locale?: string }
): { dateLine: string; timeLine: string; rangeLine: string } {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = opts?.endsAt
    ? typeof opts.endsAt === "string"
      ? new Date(opts.endsAt)
      : opts.endsAt
    : null;
  const timeZone = opts?.timezone || undefined;
  const locale = opts?.locale || undefined;

  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  };
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  };

  const dateLine = new Intl.DateTimeFormat(locale, dateFmt).format(start);
  const timeLine = new Intl.DateTimeFormat(locale, timeFmt).format(start);
  let rangeLine = timeLine;
  if (end && !Number.isNaN(end.getTime())) {
    const endTime = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone,
    }).format(end);
    rangeLine = `${new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(start)} – ${endTime}`;
  }
  return { dateLine, timeLine, rangeLine };
}

export function defaultEndsAt(startsAt: Date, durationHours = 2): Date {
  return new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
}
