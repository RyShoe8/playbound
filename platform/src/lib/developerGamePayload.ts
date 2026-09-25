import { z } from "zod";
import { GENRES, LAUNCH_METHODS, launcherInstallSchema, normalizeTags } from "@/lib/gamePayload";
import { hardwareRequirementsBlockSchema } from "@/lib/hardware/schema";

/**
 * Editorial fields that are strictly forbidden from developer modification.
 * Developers cannot view or mutate these fields via developer endpoints.
 */
export const FORBIDDEN_EDITORIAL_FIELDS = [
  "qualityBar",
  "whyWePickedIt",
  "thatOneThing",
  "bestFor",
  "notFor",
  "comparableTo",
  "installSteps",
  "firstPlaySteps",
  "multiplayerGamingSteps",
  "faq",
  "gameOfWeek",
  "hiddenGem",
  "masterCopy",
  "complete",
  "access",
  "status",
  "published",
  "playboundSupported",
  "serverLobbyAuth",
  "submissionId",
  "managedBy",
  "ownerUserId",
  "adminUpdatedAt",
] as const;

function dropUnknown(allowed: readonly string[]) {
  const set = new Set(allowed);
  return (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string" && set.has(v)) : value;
}

const optionalUrl = z
  .union([z.string().trim().url().max(500), z.literal(""), z.null()])
  .optional()
  .transform((v) => (!v ? null : v));

const optionalString = (max = 500) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v));

/**
 * Developer-controlled payload schema.
 * Only permits fields a developer has legitimate authority to edit.
 * Any extra or editorial fields are stripped out automatically.
 */
export const developerGamePayloadSchema = z
  .object({
    tagline: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(8000),
    website: z.string().trim().url().max(500),
    githubRepo: z
      .union([
        z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo"),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((v) => (!v ? null : v)),
    genres: z.preprocess(dropUnknown(GENRES), z.array(z.enum(GENRES)).default([])),
    tags: z.preprocess(normalizeTags, z.array(z.string().trim().min(1).max(40)).max(30).default([])),
    aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    license: z.string().trim().min(1).max(120).default("Proprietary"),
    releaseYear: z.number().int().min(1970).max(2100),
    sizeMB: z.number().min(0).max(1_000_000).default(0),
    platforms: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    features: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    maxPlayers: z.number().int().positive().max(100_000).nullable().default(null),
    launchMethods: z.preprocess(
      dropUnknown(LAUNCH_METHODS),
      z.array(z.enum(LAUNCH_METHODS)).min(1, "Pick at least one launch method")
    ),
    browserPlayable: z.boolean().default(false),
    steamDeck: z.boolean().default(false),
    steamAppId: z
      .union([z.string().trim().regex(/^\d+$/, "Steam app id must be numeric"), z.literal(""), z.null()])
      .optional()
      .transform((v) => (!v ? null : v)),
    androidStoreUrl: optionalUrl,
    iosStoreUrl: optionalUrl,
    coverImage: optionalString(500),
    screenshots: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    videos: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
    systemRequirements: z.object({
      min: z.string().trim().min(1).max(500),
      recommended: z.string().trim().min(1).max(500),
    }),
    hardwareRequirements: hardwareRequirementsBlockSchema.optional().nullable(),
    controls: z.unknown().optional().nullable(),
    launcherInstall: launcherInstallSchema.optional().nullable(),
    communityLinks: z
      .object({
        officialDiscord: z
          .object({
            inviteUrl: optionalUrl,
            serverName: optionalString(120),
          })
          .optional()
          .nullable(),
      })
      .optional()
      .nullable(),
  })
  .strip();

export type DeveloperGamePayload = z.infer<typeof developerGamePayloadSchema>;
