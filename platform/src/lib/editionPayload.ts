import { z } from "zod";
import {
  EDITION_STATUSES,
  EDITION_TYPES,
  EDITION_VISIBILITIES,
  INSTALL_METHODS,
  VERIFICATION_LEVELS,
} from "@/lib/editionTypes";
import { hardwareRequirementsBlockSchema } from "@/lib/hardware/schema";
import { normalizeTags } from "@/lib/gamePayload";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .default("")
  .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), {
    message: "Must be a full http:// or https:// URL",
  });

/**
 * Artwork, which may be ours rather than somebody else's.
 *
 * Images are routinely served from `public/` — the HoloCure PlayBound edition
 * ships `/games/holocure/editions/playbound.webp` — and requiring an absolute
 * URL rejected those outright, so an edition with perfectly good local artwork
 * could not be saved at all. The game schema has always accepted a bare path
 * here; only editions were stricter, and only editions broke.
 *
 * Still refuses anything that is neither: a value like `kay-yu.itch.io/x`
 * renders as a broken relative link rather than going where it meant to.
 */
const optionalMediaUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .default("")
  .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v) || /^\/[^/\s]\S*$/.test(v), {
    message: "Must be a full http:// or https:// URL, or a site path like /games/…",
  });

const installStepSchema = z.object({
  platform: z.enum(["all", "windows", "macos", "linux"]).default("all"),
  text: z.string().trim().min(1).max(500),
  command: z.string().trim().max(500).nullish(),
});

/**
 * Per-method install configuration.
 *
 * Every block is optional so an edition can carry config for more than one
 * method (a desktop edition that also has a mobile build). Which block is
 * *required* depends on the selected installMethod and is enforced by
 * `superRefine` below rather than by the shape — that keeps adding a method a
 * one-line change here instead of a new schema variant.
 */
const installConfigSchema = z
  .object({
    official_download: z
      .object({
        url: optionalUrl,
        fileName: z.string().trim().max(200).optional(),
        sizeMB: z.number().min(0).max(1_000_000).optional(),
        checksum: z.string().trim().max(200).optional(),
        platformUrls: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    steam: z.object({ appId: z.string().trim().max(30).optional() }).optional(),
    epic: z
      .object({
        productSlug: z.string().trim().max(200).optional(),
        launchUrl: optionalUrl,
      })
      .optional(),
    gog: z.object({ productUrl: optionalUrl }).optional(),
    itch: z.object({ pageUrl: optionalUrl }).optional(),
    playbound_installer: z
      .object({
        kind: z.string().trim().max(50).optional(),
        repo: z.string().trim().max(200).nullish(),
        assetPattern: z.string().trim().max(200).nullish(),
        exeHint: z.string().trim().max(200).nullish(),
        url: z.string().trim().max(500).nullish(),
        urlMac: z.string().trim().max(500).nullish(),
        urlLinux: z.string().trim().max(500).nullish(),
        fileName: z.string().trim().max(200).nullish(),
        versionLabel: z.string().trim().max(100).nullish(),
        knownExePaths: z.array(z.string().trim().max(300)).max(20).optional(),
        launchArgs: z.array(z.string().trim().max(200)).max(20).optional(),
        installRoot: z.string().trim().max(300).nullish(),
        connectArgs: z.array(z.string().trim().max(200)).max(20).optional(),
        note: z.string().trim().max(500).nullish(),
        checksumMd5: z.string().trim().max(64).nullish(),
        md5: z.string().trim().max(64).nullish(),
        postInstallDiscord: z.union([z.string().trim().max(500), z.boolean()]).nullish(),
        postInstallEqw: z.boolean().optional(),
        overlayUrl: z.string().trim().max(500).nullish(),
        overlayFileName: z.string().trim().max(200).nullish(),
        overlayDest: z.string().trim().max(300).nullish(),
        unwrapSingleRoot: z.boolean().optional(),
        needsDosBox: z.boolean().optional(),
        requiresBaseDir: z.boolean().optional(),
        steps: z.array(installStepSchema).max(30).optional(),
      })
      .optional(),
    external_installer: z
      .object({ url: optionalUrl, instructions: z.string().trim().max(1000).optional() })
      .optional(),
    manual: z.object({ steps: z.array(installStepSchema).max(30).optional() }).optional(),
    browser: z.object({ playUrl: optionalUrl }).optional(),
    mobile_store: z
      .object({ androidUrl: optionalUrl, iosUrl: optionalUrl })
      .optional(),
  })
  .default({});

export const editionPayloadSchema = z
  .object({
    gameSlug: z.string().trim().min(1).max(80).regex(SLUG, "Invalid game slug"),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(SLUG, "Slug may only contain lowercase letters, numbers and hyphens"),
    name: z.string().trim().min(2).max(120),
    shortDescription: z.string().trim().max(300).default(""),
    description: z.string().trim().max(20000).default(""),

    type: z.enum(EDITION_TYPES).default("community"),
    status: z.enum(EDITION_STATUSES).default("active"),
    visibility: z.enum(EDITION_VISIBILITIES).default("public"),

    sortOrder: z.number().int().min(0).max(9999).default(0),
    isDefault: z.boolean().default(false),

    branding: z
      .object({
        logo: optionalMediaUrl,
        heroImage: optionalMediaUrl,
        screenshots: z.array(z.string().trim().max(500)).max(30).default([]),
        videos: z.array(z.string().trim().max(500)).max(20).default([]),
        artHue: z.number().int().min(0).max(360).optional(),
      })
      // Zod needs a fully-populated default here because the inner fields
      // themselves have defaults, so `{}` does not satisfy the output type.
      .default(() => ({ logo: "", heroImage: "", screenshots: [], videos: [] })),

    links: z
      .object({
        website: optionalUrl,
        discord: optionalUrl,
        wiki: optionalUrl,
        github: optionalUrl,
        forum: optionalUrl,
      })
      .default(() => ({ website: "", discord: "", wiki: "", github: "", forum: "" })),

    installMethod: z.enum(INSTALL_METHODS).default("manual"),
    installConfig: installConfigSchema,

    requirements: z
      .object({
        min: z.string().trim().max(500).optional(),
        recommended: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .optional(),
    hardwareRequirements: hardwareRequirementsBlockSchema.optional().nullable(),

    platforms: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    features: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
    tags: z.preprocess(
      normalizeTags,
      z.array(z.string().trim().min(1).max(60)).max(40).default([])
    ),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    serverName: z.string().trim().max(120).optional(),
    languages: z.array(z.string().trim().min(1).max(60)).max(60).default([]),

    version: z.string().trim().max(80).optional(),
    patchNotes: z
      .array(
        z.object({
          version: z.string().trim().min(1).max(80),
          date: z.string().trim().max(40).optional(),
          title: z.string().trim().max(200).optional(),
          body: z.string().trim().max(5000).optional(),
          url: optionalUrl,
        })
      )
      .max(100)
      .default([]),
    faq: z
      .array(z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(2000) }))
      .max(40)
      .default([]),

    verified: z.boolean().default(false),
    verificationLevel: z.enum(VERIFICATION_LEVELS).default("untested"),
    verificationNote: z.string().trim().max(1000).optional(),

    population: z.number().int().min(0).nullish(),
  })
  .superRefine((value, ctx) => {
    // The selected method must actually be usable, otherwise the edition ships
    // a dead install button that only shows up when a reader clicks it.
    const cfg = value.installConfig ?? {};
    const require = (ok: boolean, message: string) => {
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["installConfig"] });
      }
    };

    switch (value.installMethod) {
      case "steam":
        require(Boolean(cfg.steam?.appId), "Steam install needs a Steam app ID.");
        break;
      case "epic":
        require(
          Boolean(cfg.epic?.launchUrl || cfg.epic?.productSlug),
          "Epic install needs a product slug or launch URL."
        );
        break;
      case "gog":
        require(Boolean(cfg.gog?.productUrl), "GOG install needs a product URL.");
        break;
      case "itch":
        require(Boolean(cfg.itch?.pageUrl), "itch.io install needs a page URL.");
        break;
      case "official_download":
        require(
          Boolean(cfg.official_download?.url || value.links?.website),
          "Official download needs a download URL (or a website link to fall back on)."
        );
        break;
      case "external_installer":
        require(Boolean(cfg.external_installer?.url), "External installer needs a URL.");
        break;
      case "browser":
        require(
          Boolean(cfg.browser?.playUrl || value.links?.website),
          "Browser play needs a play URL (or a website link to fall back on)."
        );
        break;
      case "mobile_store":
        require(
          Boolean(cfg.mobile_store?.androidUrl || cfg.mobile_store?.iosUrl),
          "Mobile install needs a Google Play or App Store URL."
        );
        break;
      case "manual":
        require(
          (cfg.manual?.steps?.length ?? 0) > 0,
          "Manual install needs at least one instruction step."
        );
        break;
      case "playbound_installer":
        require(
          Boolean(cfg.playbound_installer?.kind),
          "PlayBound installer needs an installer recipe kind."
        );
        break;
    }

    // Certification and the verified flag must agree, or the badge lies.
    if (value.verified && value.verificationLevel === "untested") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A verified edition needs a verification level other than Untested.",
        path: ["verificationLevel"],
      });
    }
  });

export type EditionPayload = z.infer<typeof editionPayloadSchema>;

/** PATCH accepts the same shape; partial updates re-send the whole edition. */
export const editionUpdateSchema = editionPayloadSchema;

export const editionReorderSchema = z.object({
  gameSlug: z.string().trim().min(1).max(80),
  /** Edition ids in the desired order. */
  order: z.array(z.string().trim().min(1)).max(200),
});
