import { z } from "zod";

const miniGameSchema = z.object({
  title: z.string().max(200).default(""),
  description: z.string().max(2000).default(""),
  imageUrl: z.string().max(2000).default(""),
  url: z.string().max(2000).default(""),
});

const epicGameSchema = z.object({
  title: z.string().max(200).default(""),
  description: z.string().max(2000).default(""),
  imageUrl: z.string().max(2000).default(""),
  badge: z.string().max(40).default("FREE"),
});

/** Loose validation for persisted newsletter builder drafts. */
export const newsletterEmailDraftSchema = z.object({
  featured: z
    .object({
      badge: z.string().max(80).default("FEATURED PICK"),
      title: z.string().max(200).default(""),
      description: z.string().max(4000).default(""),
      imageUrl: z.string().max(2000).default(""),
      ctaLabel: z.string().max(120).default("Play Now on Playbound"),
      ctaUrl: z.string().max(2000).default(""),
    })
    .default({
      badge: "FEATURED PICK",
      title: "",
      description: "",
      imageUrl: "",
      ctaLabel: "Play Now on Playbound",
      ctaUrl: "",
    }),
  newSectionTitle: z.string().max(120).default("New on Playbound"),
  newGames: z.array(miniGameSchema).max(8).default([]),
  epic: z
    .object({
      eyebrow: z.string().max(80).default("EPIC STORE DEALS"),
      title: z.string().max(120).default("Free Games This Week"),
      games: z.array(epicGameSchema).max(12).default([]),
    })
    .default({
      eyebrow: "EPIC STORE DEALS",
      title: "Free Games This Week",
      games: [],
    }),
  footer: z
    .object({
      communityLabel: z.string().max(80).default("JOIN OUR COMMUNITY"),
      blueskyUrl: z.string().max(2000).default(""),
      redditUrl: z.string().max(2000).default(""),
      discordUrl: z.string().max(2000).default(""),
      facebookUrl: z.string().max(2000).default(""),
      unsubscribeUrl: z.string().max(2000).default(""),
      copyrightYear: z.number().int().min(2020).max(2100).default(new Date().getUTCFullYear()),
    })
    .default({
      communityLabel: "JOIN OUR COMMUNITY",
      blueskyUrl: "",
      redditUrl: "",
      discordUrl: "",
      facebookUrl: "",
      unsubscribeUrl: "",
      copyrightYear: new Date().getUTCFullYear(),
    }),
});

export type NewsletterEmailDraftInput = z.infer<typeof newsletterEmailDraftSchema>;
