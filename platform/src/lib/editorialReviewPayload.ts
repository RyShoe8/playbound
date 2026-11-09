import { z } from "zod";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "Must be an http(s) link to the full review");

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

/**
 * One outlet review as an admin enters it. The score is stored exactly as the
 * outlet published it (8 out of 10, 4.5 out of 5); both halves or neither.
 */
export const editorialReviewSchema = z
  .object({
    gameSlug: z.string().trim().min(1).max(120),
    editionSlug: optionalText(80),
    outlet: z.string().trim().min(1).max(80),
    author: optionalText(80),
    url: httpUrl,
    snippet: z
      .union([z.string().trim().max(400), z.null()])
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v == null || v.length >= 10, "Snippet is too short"),
    scoreText: optionalText(20),
    score: z.union([z.number().min(0), z.null()]).optional().default(null),
    scoreMax: z.union([z.number().min(1), z.null()]).optional().default(null),
    publishedAt: optionalText(40).transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }),
    status: z.enum(["published", "hidden"]).optional().default("published"),
  })
  .superRefine((v, ctx) => {
    if ((v.score == null) !== (v.scoreMax == null)) {
      ctx.addIssue({ code: "custom", path: ["score"], message: "Give both the score and what it is out of, or neither" });
    } else if (v.score != null && v.scoreMax != null && v.score > v.scoreMax) {
      ctx.addIssue({ code: "custom", path: ["score"], message: "Score is higher than its maximum" });
    }
  });

export type EditorialReviewInput = z.infer<typeof editorialReviewSchema>;
