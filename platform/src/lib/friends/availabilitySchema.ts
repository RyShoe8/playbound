import { z } from "zod";

export const availabilitySchema = z.object({
  timezone: z.string().max(80).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid timezone"),
  window: z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() }).nullable(),
  weekly: z.array(z.object({ day: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine(value => value.endMinute > value.startMinute, "End time must follow start time")).max(14),
}).superRefine((value, ctx) => {
  if (value.window) {
    const start = Date.parse(value.window.startsAt), end = Date.parse(value.window.endsAt);
    if (end <= start || end - start > 24 * 3600_000 || end > Date.now() + 8 * 86400_000) ctx.addIssue({ code: "custom", message: "Choose a window up to 24 hours long within the next week" });
  }
});
