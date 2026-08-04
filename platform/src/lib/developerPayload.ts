import { z } from "zod";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Current year + a little slack, so a typo'd future date is rejected. */
const MAX_FOUNDED = new Date().getFullYear() + 1;

export const developerPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(SLUG, "Slug may only contain lowercase letters, numbers and hyphens"),
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(200).default(""),
  about: z.string().trim().max(4000).default(""),
  // 0 means "unknown" and hides the stat on the profile, so allow it alongside
  // real years rather than forcing a made-up date.
  founded: z
    .number()
    .int()
    .min(0)
    .max(MAX_FOUNDED)
    .default(0)
    .refine((y) => y === 0 || y >= 1950, { message: "Founded year looks wrong" }),
  location: z.string().trim().max(120).default(""),
  website: z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), {
      message: "Website must start with http:// or https://",
    }),
  artHue: z.number().int().min(0).max(360).default(210),
  published: z.boolean().default(true),
});

export type DeveloperPayload = z.infer<typeof developerPayloadSchema>;
