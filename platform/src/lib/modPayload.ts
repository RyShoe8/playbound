import { z } from "zod";
import {
  defaultArtFor,
  slugifyTitle,
  installStepSchema,
  faqEntrySchema,
} from "@/lib/gamePayload";
import { CATALOG_STATUSES } from "@/lib/catalogStatus";
import { modHardwareRequirementsSchema } from "@/lib/hardware/schema";
export const DOWNLOAD_KINDS = ["github-zip", "direct-zip", "external"] as const;
export const MANAGED_BY = ["admin", "developer"] as const;
export const MOD_PLATFORMS = ["Windows", "macOS", "Linux"] as const;

export const modPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  baseGameSlug: z.string().trim().min(1).max(80),
  developerSlug: z.string().trim().min(1).max(80),
  developerName: z.string().trim().max(120).optional().nullable(),
  license: z.string().trim().min(1).max(120),
  releaseYear: z.number().int().min(1970).max(2100),
  sizeMB: z.number().min(0).max(1_000_000),
  website: z.string().trim().url().max(500),
  githubRepo: z
    .union([
      z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (!v ? null : v)),
  downloadKind: z.enum(DOWNLOAD_KINDS).default("github-zip"),
  assetPattern: z
    .union([z.string().trim().max(200), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  directUrl: z
    .union([z.string().trim().url().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  installRelativePath: z
    .string()
    .trim()
    .max(200)
    .default("mods")
    .transform((v) => v.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/")),
  autoUpdatePinned: z.boolean().optional().default(true),
  art: z
    .object({
      from: z.string().trim().min(1).max(40),
      to: z.string().trim().min(1).max(40),
      icon: z.string().trim().min(1).max(40),
    })
    .optional(),
  coverImage: z
    .union([z.string().trim().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  screenshots: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  published: z.boolean().default(false),
  status: z.enum(CATALOG_STATUSES).optional(),
  managedBy: z.enum(MANAGED_BY).default("admin"),
  ownerUserId: z
    .union([z.string().trim().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),

  // Editorial depth. installSteps and faq are auto-derived at import;
  // longDescription and whatItChanges are gated before publishing.
  longDescription: z
    .union([z.string().trim().max(20000), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? undefined : v)),
  whatItChanges: z
    .union([z.string().trim().max(4000), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? undefined : v)),
  compatibility: z
    .union([z.string().trim().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? undefined : v)),
  platforms: z.array(z.enum(MOD_PLATFORMS)).max(3).default([]),
  hardwareRequirements: modHardwareRequirementsSchema.optional().nullable(),
  installSteps: z.array(installStepSchema).max(30).default([]),
  faq: z.array(faqEntrySchema).max(30).default([]),
  classificationIds: z.array(z.string().trim()).default([]),
});

export type ModPayload = z.infer<typeof modPayloadSchema>;

export function withDefaultModArt(payload: ModPayload): ModPayload & { art: NonNullable<ModPayload["art"]> } {
  return {
    ...payload,
    art: payload.art ?? defaultArtFor([], payload.slug),
  };
}

export { slugifyTitle };

export const emptyModDraft = (baseGameSlug = ""): ModPayload => ({
  slug: "",
  title: "",
  tagline: "",
  description: "",
  baseGameSlug,
  developerSlug: "indie-web",
  developerName: null,
  license: "Free / Open Source",
  releaseYear: new Date().getFullYear(),
  sizeMB: 0,
  website: "https://example.com",
  githubRepo: null,
  downloadKind: "github-zip",
  assetPattern: "\\.zip$",
  directUrl: null,
  installRelativePath: "mods",
  autoUpdatePinned: true,
  art: defaultArtFor([], ""),
  coverImage: null,
  screenshots: [],
  published: false,
  status: "draft",
  managedBy: "admin",
  ownerUserId: null,
  longDescription: undefined,
  whatItChanges: undefined,
  compatibility: undefined,
  platforms: [],
  installSteps: [],
  faq: [],
  classificationIds: [],
});
