import { z } from "zod";

export const GENRES = [
  "Strategy",
  "RTS",
  "FPS",
  "Racing",
  "Puzzle",
  "RPG",
  "Roguelike",
  "Simulation",
  "Platformer",
  "Sandbox",
  "Tower Defense",
  "Space",
  "Arcade",
] as const;

export const LAUNCH_METHODS = ["browser", "install", "server"] as const;

export const gamePayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  developerSlug: z.string().trim().min(1).max(80),
  developerName: z.string().trim().max(120).optional().nullable(),
  genres: z.array(z.enum(GENRES)).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  license: z.string().trim().min(1).max(120),
  releaseYear: z.number().int().min(1970).max(2100),
  sizeMB: z.number().min(0).max(1_000_000),
  platforms: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  features: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  launchMethods: z.array(z.enum(LAUNCH_METHODS)).min(1),
  browserPlayable: z.boolean().default(false),
  steamDeck: z.boolean().default(false),
  website: z.string().trim().url().max(500),
  githubRepo: z
    .union([
      z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (!v ? null : v)),
  gameOfWeek: z.boolean().default(false),
  hiddenGem: z.boolean().default(false),
  art: z.object({
    from: z.string().trim().min(1).max(40),
    to: z.string().trim().min(1).max(40),
    icon: z.string().trim().min(1).max(40),
  }),
  coverImage: z
    .union([z.string().trim().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  screenshots: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  systemRequirements: z.object({
    min: z.string().trim().min(1).max(500),
    recommended: z.string().trim().min(1).max(500),
  }),
  published: z.boolean().default(false),
  submissionId: z.string().optional().nullable(),
});

export type GamePayload = z.infer<typeof gamePayloadSchema>;

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const emptyGameDraft = (): GamePayload => ({
  slug: "",
  title: "",
  tagline: "",
  description: "",
  developerSlug: "openra-team",
  developerName: null,
  genres: [],
  tags: [],
  license: "Free / Open Source",
  releaseYear: new Date().getFullYear(),
  sizeMB: 0,
  platforms: ["Windows"],
  features: [],
  launchMethods: ["install"],
  browserPlayable: false,
  steamDeck: false,
  website: "https://example.com",
  githubRepo: null,
  gameOfWeek: false,
  hiddenGem: false,
  art: { from: "#1e293b", to: "#0ea5e9", icon: "Gamepad2" },
  coverImage: null,
  screenshots: [],
  systemRequirements: {
    min: "See official site",
    recommended: "See official site",
  },
  published: false,
  submissionId: null,
});
