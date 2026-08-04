import { z } from "zod";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const collectionPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(SLUG, "Slug may only contain lowercase letters, numbers and hyphens"),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(2000),
  gameSlugs: z
    .array(z.string().trim().regex(SLUG, "Invalid game slug"))
    .max(60)
    .default([])
    // A duplicate would render the same card twice and skew the count.
    .transform((slugs) => [...new Set(slugs)]),
  published: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export type CollectionPayload = z.infer<typeof collectionPayloadSchema>;
