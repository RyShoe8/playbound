import { z } from "zod";

const httpsImage = z.union([z.literal(""), z.url().max(2048).refine((url) => url.startsWith("https://"), "Use an HTTPS image URL")]);

export const blogPostInput = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(20).max(400),
  bodyMarkdown: z.string().trim().min(40).max(100000),
  coverImageUrl: httpsImage,
  authorName: z.string().trim().min(2).max(100),
  published: z.boolean(),
});

export const createBlogPostInput = blogPostInput.extend({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens").max(120),
});
