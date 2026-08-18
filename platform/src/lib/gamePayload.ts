import { z } from "zod";
import type { Genre, QualityBar } from "@/lib/data/types";
import {
  LAUNCHER_INSTALL_KINDS,
  defaultLauncherInstallForWebsite,
  isPcInstallCandidate,
  type LauncherInstall,
} from "@/lib/launcherInstall";
import { CATALOG_STATUSES } from "@/lib/catalogStatus";
import { hardwareRequirementsBlockSchema } from "@/lib/hardware/schema";

/**
 * The closed set of genres a game may carry.
 *
 * Must stay in sync with the Genre union in src/lib/data/types.ts — the two
 * are separate so the type layer does not have to depend on zod. A value in
 * one but not the other will typecheck in some places and fail validation in
 * others.
 *
 * The second row was added for live-service titles, which the original list
 * (built around the open-source catalog) could not describe: an MMO, a
 * survival game or a battle-royale shooter had no honest option and would have
 * been forced into RPG or Simulation.
 */
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
  "Pirate",
  "MMO",
  "Survival",
  "Shooter",
  "Action",
  "Adventure",
  "Sports",
  "Fighting",
  "Social Deduction",
  "Card Game",
  "Idle",
  "Horror",
  "MOBA",
  /*
   * Party Game covers the browser and living-room titles that Social Deduction
   * and Arcade both described badly — GameBuddies and PixReveal are the cases
   * that prompted it.
   */
  "Party Game",
] as const;

export const LAUNCH_METHODS = ["browser", "install", "server"] as const;

/**
 * Drop array entries that are not in a closed set, instead of rejecting the
 * whole payload.
 *
 * A stored value outside the set is unfixable through the admin: the form only
 * renders checkboxes for values it knows, so an unrecognised one cannot be
 * seen or unticked, yet it is still submitted and still fails validation. The
 * record becomes permanently unsaveable — the error names the valid options
 * while the field appears to already hold one of them.
 *
 * Filtering makes bad data self-healing: the next save quietly discards it.
 * Genuinely empty selections are still caught by the schema's own min() rule.
 */
function dropUnknown(allowed: readonly string[]) {
  const set = new Set(allowed);
  return (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string" && set.has(v)) : value;
}

export const PLATFORMS = ["Windows", "macOS", "Linux", "Android", "iOS", "Web"] as const;

/** Platforms gear may claim (games OS list + common consoles / handhelds). */
export const GEAR_PLATFORMS = [
  ...PLATFORMS,
  "Xbox",
  "PlayStation",
  "Nintendo",
  "Steam Deck",
] as const;

export const FEATURES = [
  "Multiplayer",
  "Singleplayer",
  "Co-op",
  /*
   * Couch Co-Op is the umbrella for playing together on one machine. It sits
   * above Split-Screen Co-op and Hotseat, which are two specific ways of doing
   * it — a game sharing one screen without splitting it had no honest option.
   */
  "Couch Co-Op",
  "Split-Screen Co-op",
  "Hotseat",
  "LAN Support",
  "Dedicated Servers",
  "Cross-play",
  "Controller Support",
  "Family Friendly",
  "Mod Support",
  "Map Editor",
  "Level Editor",
  "Custom Maps",
  "Community Content",
  "Replays",
  "Ranked Ladder",
  "Spectator Mode",
  "Story Campaign",
  "Daily Runs",
  "Procedural Worlds",
  "Team Play",
] as const;

export const LAUNCHER_KINDS = LAUNCHER_INSTALL_KINDS;

const optionalTrimmed = z
  .union([z.string().trim().max(500), z.literal(""), z.null()])
  .optional()
  .transform((v) => (!v ? null : v));

export const launcherInstallSchema = z
  .object({
    enabled: z.boolean().default(true),
    kind: z.enum(LAUNCHER_INSTALL_KINDS),
    repo: optionalTrimmed,
    assetPattern: optionalTrimmed,
    exeHint: optionalTrimmed,
    url: optionalTrimmed,
    fileName: optionalTrimmed,
    versionLabel: optionalTrimmed,
    knownExePaths: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
    registryTitles: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    installRoot: optionalTrimmed,
    connectArgs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    note: optionalTrimmed,
    detectedVersion: optionalTrimmed,
    versionCheckStatus: optionalTrimmed,
    versionCheckNote: optionalTrimmed,
    autoUpdatePinned: z.boolean().optional().default(true),
    overlayUrl: optionalTrimmed,
    overlayFileName: optionalTrimmed,
    overlayDest: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (!val.enabled) return;
    if (val.kind === "github-zip" || val.kind === "github-installer" || val.kind === "github-jar") {
      if (!val.repo) {
        ctx.addIssue({ code: "custom", message: "GitHub install kinds need owner/repo", path: ["repo"] });
      }
      if (!val.assetPattern) {
        ctx.addIssue({
          code: "custom",
          message: "GitHub install kinds need an assetPattern",
          path: ["assetPattern"],
        });
      }
    }
    if (
      (val.kind === "direct-zip" ||
        val.kind === "direct-7z" ||
        val.kind === "direct-installer" ||
        val.kind === "direct-exe" ||
        val.kind === "external") &&
      !val.url
    ) {
      ctx.addIssue({ code: "custom", message: "This install kind needs a URL", path: ["url"] });
    }
  });

export const TAGS = [
  "2D",
  "Pixel Art",
  "Classic",
  "Competitive",
  "Co-op",
  "LAN",
  "Mods",
  "Open World",
  "Sandbox",
  "Sci-Fi",
  "Fantasy",
  "Space Trading",
  "Turn-Based",
  "Arena Shooter",
  "Kart Racing",
  "Family Friendly",
  "Browser",
  "Indie",
  "Multiplayer",
  "Singleplayer",
] as const;

const ART_BY_GENRE: Record<string, { from: string; to: string; icon: string }> = {
  Strategy: { from: "#312e81", to: "#a78bfa", icon: "Swords" },
  RTS: { from: "#7f1d1d", to: "#f59e0b", icon: "Radar" },
  FPS: { from: "#0c4a6e", to: "#22d3ee", icon: "Crosshair" },
  Racing: { from: "#14532d", to: "#84cc16", icon: "Flag" },
  Puzzle: { from: "#4c1d95", to: "#c084fc", icon: "Sparkles" },
  RPG: { from: "#1e3a5f", to: "#38bdf8", icon: "Sparkles" },
  Roguelike: { from: "#3b0764", to: "#e879f9", icon: "Skull" },
  Simulation: { from: "#1e293b", to: "#94a3b8", icon: "Cog" },
  Platformer: { from: "#0e7490", to: "#67e8f9", icon: "Zap" },
  Sandbox: { from: "#365314", to: "#a3e635", icon: "Blocks" },
  "Tower Defense": { from: "#7c2d12", to: "#fb923c", icon: "Landmark" },
  Space: { from: "#0f172a", to: "#6366f1", icon: "Rocket" },
  Arcade: { from: "#831843", to: "#f472b6", icon: "Target" },
  Pirate: { from: "#0c4a6e", to: "#f59e0b", icon: "Flag" },
};

export function defaultArtFor(genres: string[] = [], slug = ""): { from: string; to: string; icon: string } {
  const primary = genres[0];
  if (primary && ART_BY_GENRE[primary]) return ART_BY_GENRE[primary];
  const palettes = Object.values(ART_BY_GENRE);
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash + slug.charCodeAt(i) * (i + 1)) % palettes.length;
  return palettes[hash] ?? { from: "#1e293b", to: "#0ea5e9", icon: "Gamepad2" };
}

/** Shared shapes for the deeper editorial fields. */
export const installStepSchema = z.object({
  platform: z.enum(["all", "windows", "macos", "linux"]).default("all"),
  text: z.string().trim().min(1).max(2000),
  // Wrapped in z.optional so the key itself is optional in the inferred type,
  // matching InstallStep. A bare .transform() would make it required-but-
  // possibly-undefined, which is a different (and incompatible) shape.
  command: z.optional(
    z
      .union([z.string().trim().max(500), z.literal(""), z.null()])
      .transform((v) => (!v ? undefined : v))
  ),
});

export const faqEntrySchema = z.object({
  q: z.string().trim().min(1).max(300),
  a: z.string().trim().min(1).max(3000),
});

const qualityBarFieldsSchema = z.object({
  genuinelyFree: z.boolean().default(false),
  finished: z.boolean().default(false),
  activelyMaintained: z.boolean().default(false),
  standsAlone: z.boolean().default(false),
  highQuality: z.boolean().default(false),
  /** Accepted on input only — mapped to highQuality, never written back. */
  wontDisappear: z.boolean().optional(),
  verdict: z.string().trim().max(1000).default(""),
  lastVerified: z.string().trim().max(40).default(""),
});

export const qualityBarSchema = qualityBarFieldsSchema.transform((bar) => ({
  genuinelyFree: bar.genuinelyFree,
  finished: bar.finished,
  activelyMaintained: bar.activelyMaintained,
  standsAlone: bar.standsAlone,
  highQuality: Boolean(bar.highQuality || bar.wontDisappear),
  verdict: bar.verdict,
  lastVerified: bar.lastVerified,
}));

/** Map legacy Mongo/seed bars onto the public QualityBar shape. */
export function normalizeQualityBar(
  bar: {
    genuinelyFree?: boolean;
    finished?: boolean;
    activelyMaintained?: boolean;
    standsAlone?: boolean;
    highQuality?: boolean;
    wontDisappear?: boolean;
    verdict?: string;
    lastVerified?: string;
  } | null | undefined
): QualityBar | null {
  if (!bar) return null;
  return {
    genuinelyFree: Boolean(bar.genuinelyFree),
    finished: Boolean(bar.finished),
    activelyMaintained: Boolean(bar.activelyMaintained),
    standsAlone: Boolean(bar.standsAlone),
    highQuality: Boolean(bar.highQuality ?? bar.wontDisappear),
    verdict: typeof bar.verdict === "string" ? bar.verdict : "",
    lastVerified: typeof bar.lastVerified === "string" ? bar.lastVerified : "",
  };
}

const optionalCents = z
  .union([z.number().int().min(0).max(1_000_000), z.null()])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const retailOfferSchema = z.object({
  retailer: z.string().trim().min(1).max(80),
  url: z.string().trim().max(2000),
  priceCents: z.number().int().min(0).max(1_000_000),
  affiliate: z.boolean().optional().default(true),
  lastCheckedAt: z
    .union([z.string().trim().max(40), z.literal(""), z.null()])
    .optional()
    .transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }),
  isActive: z.boolean().optional().default(true),
});

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const gameAccessSchema = z
  .object({
    priceType: z.enum(["FREE", "PAID", "PAID_BASE_GAME_REQUIRED"]),
    regularPriceCents: optionalCents,
    currentPriceCents: optionalCents,
    qualifyingPriceCents: optionalCents,
    currency: z.literal("USD").optional(),
    purchaseRequired: z.boolean().optional(),
    requiresBaseGameAssets: z.boolean().optional(),
    requiresOwnedBaseGame: z.boolean().optional(),
    requiresGameSlugs: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    offers: z.array(retailOfferSchema).max(20).optional().default([]),
  })
  .transform((a) => {
    const purchaseRequired =
      a.priceType !== "FREE" ||
      Boolean(a.requiresBaseGameAssets) ||
      Boolean(a.requiresOwnedBaseGame);
    const offers =
      a.priceType === "PAID"
        ? (a.offers ?? []).filter((o) => o.retailer && o.priceCents > 0 && isHttpUrl(o.url))
        : [];
    const offerPrice = offers
      .filter((o) => o.isActive && o.priceCents > 0)
      .reduce<number | null>((best, o) => (best == null || o.priceCents < best ? o.priceCents : best), null);
    return {
      priceType: a.priceType,
      regularPriceCents: a.regularPriceCents ?? null,
      currentPriceCents: offerPrice ?? a.currentPriceCents ?? null,
      qualifyingPriceCents: a.qualifyingPriceCents ?? null,
      currency: "USD" as const,
      purchaseRequired,
      requiresBaseGameAssets: Boolean(a.requiresBaseGameAssets),
      requiresOwnedBaseGame: Boolean(a.requiresOwnedBaseGame),
      requiresGameSlugs: a.requiresGameSlugs ?? [],
      offers,
    };
  });

const optionalProse = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? undefined : v));

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
  genres: z.preprocess(dropUnknown(GENRES), z.array(z.enum(GENRES)).default([])),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  license: z.string().trim().min(1).max(120),
  releaseYear: z.number().int().min(1970).max(2100),
  sizeMB: z.number().min(0).max(1_000_000),
  platforms: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  features: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  launchMethods: z.preprocess(
    dropUnknown(LAUNCH_METHODS),
    z.array(z.enum(LAUNCH_METHODS)).min(1, "Pick at least one launch method")
  ),
  browserPlayable: z.boolean().default(false),
  steamDeck: z.boolean().default(false),
  website: z.string().trim().url().max(500),
  steamAppId: z
    .union([z.string().trim().regex(/^\d+$/, "Steam app id must be numeric"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  androidStoreUrl: z
    .union([z.string().trim().url().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  iosStoreUrl: z
    .union([z.string().trim().url().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  githubRepo: z
    .union([
      z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/repo"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (!v ? null : v)),
  communityLinks: z
    .object({
      officialDiscord: z
        .object({
          inviteUrl: z
            .union([z.string().trim().url().max(500), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          serverName: z
            .union([z.string().trim().max(120), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          verified: z.boolean().default(false),
          verifiedSourceUrl: z
            .union([z.string().trim().url().max(500), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          verifiedAt: z
            .union([z.string().trim().max(40), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
        })
        .optional()
        .nullable(),
      playboundDiscord: z
        .object({
          guildId: z
            .union([z.string().trim().max(40), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          channelId: z
            .union([z.string().trim().max(40), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          channelName: z
            .union([z.string().trim().max(80), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          inviteCode: z
            .union([z.string().trim().max(40), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          inviteUrl: z
            .union([z.string().trim().url().max(500), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
          provisionedAt: z
            .union([z.string().trim().max(40), z.literal(""), z.null()])
            .optional()
            .transform((v) => (!v ? null : v)),
        })
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
  gameOfWeek: z.boolean().default(false),
  hiddenGem: z.boolean().default(false),
  complete: z.boolean().default(false),
  access: gameAccessSchema.optional().nullable(),
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
  videos: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  systemRequirements: z.object({
    min: z.string().trim().min(1).max(500),
    recommended: z.string().trim().min(1).max(500),
  }),
  hardwareRequirements: hardwareRequirementsBlockSchema.optional().nullable(),
  launcherInstall: launcherInstallSchema.optional().nullable(),
  /** Zero-K / 0 A.D. lobby credentials for richer server listings (admin only). */
  serverLobbyAuth: z
    .object({
      username: z.string().trim().max(120).optional().nullable(),
      password: z.string().trim().max(200).optional().nullable(),
    })
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const username = (v.username || "").trim();
      const password = (v.password || "").trim();
      if (!username && !password) return null;
      return { username: username || null, password: password || null };
    }),
  published: z.boolean().default(false),
  status: z.enum(CATALOG_STATUSES).optional(),
  submissionId: z.string().optional().nullable(),
  managedBy: z.enum(["admin", "developer"]).default("admin"),
  ownerUserId: z
    .union([z.string().trim().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),

  // ── Editorial depth ──────────────────────────────────────────
  // installSteps and faq are auto-derived at import (see lib/enrich.ts).
  // The rest is human judgement and is gated by editorialReadiness() before
  // a game can be published.
  qualityBar: qualityBarSchema.optional().nullable(),
  longDescription: optionalProse(20000),
  whyWePickedIt: optionalProse(4000),
  installSteps: z.array(installStepSchema).max(30).default([]),
  faq: z.array(faqEntrySchema).max(30).default([]),
  bestFor: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  notFor: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  comparableTo: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export type GamePayload = z.infer<typeof gamePayloadSchema>;

export type GameAccessPayload = NonNullable<GamePayload["access"]>;

export function toPayloadAccess(
  access: {
    priceType?: string;
    regularPriceCents?: number | null;
    currentPriceCents?: number | null;
    qualifyingPriceCents?: number | null;
    currency?: string;
    purchaseRequired?: boolean;
    requiresBaseGameAssets?: boolean;
    requiresOwnedBaseGame?: boolean;
    requiresGameSlugs?: string[];
    offers?: unknown;
  } | null | undefined
): GameAccessPayload | null {
  if (!access?.priceType) return null;
  return gameAccessSchema.parse(access);
}

export type GamePayloadLauncherInstall = NonNullable<GamePayload["launcherInstall"]>;

export type CommunityLinksPayload = NonNullable<GamePayload["communityLinks"]>;

export function toPayloadCommunityLinks(
  links?: import("@/lib/data/types").GameCommunityLinks | null
): CommunityLinksPayload | null {
  if (!links) return null;
  return {
    officialDiscord: links.officialDiscord
      ? {
          inviteUrl: links.officialDiscord.inviteUrl ?? null,
          serverName: links.officialDiscord.serverName ?? null,
          verified: Boolean(links.officialDiscord.verified),
          verifiedSourceUrl: links.officialDiscord.verifiedSourceUrl ?? null,
          verifiedAt: links.officialDiscord.verifiedAt ?? null,
        }
      : null,
    playboundDiscord: links.playboundDiscord
      ? {
          guildId: links.playboundDiscord.guildId ?? null,
          channelId: links.playboundDiscord.channelId ?? null,
          channelName: links.playboundDiscord.channelName ?? null,
          inviteCode: links.playboundDiscord.inviteCode ?? null,
          inviteUrl: links.playboundDiscord.inviteUrl ?? null,
          provisionedAt: links.playboundDiscord.provisionedAt ?? null,
        }
      : null,
  };
}

function emptyOfficial() {
  return {
    inviteUrl: null as string | null,
    serverName: null as string | null,
    verified: false,
    verifiedSourceUrl: null as string | null,
    verifiedAt: null as string | null,
  };
}

function emptyPlaybound() {
  return {
    guildId: null as string | null,
    channelId: null as string | null,
    channelName: null as string | null,
    inviteCode: null as string | null,
    inviteUrl: null as string | null,
    provisionedAt: null as string | null,
  };
}

export function patchCommunityLinks(
  current: CommunityLinksPayload | null | undefined,
  patch: {
    officialDiscord?: Partial<ReturnType<typeof emptyOfficial>>;
    playboundDiscord?: Partial<ReturnType<typeof emptyPlaybound>>;
  }
): CommunityLinksPayload {
  return {
    officialDiscord: {
      ...emptyOfficial(),
      ...(current?.officialDiscord ?? {}),
      ...(patch.officialDiscord ?? {}),
    },
    playboundDiscord: {
      ...emptyPlaybound(),
      ...(current?.playboundDiscord ?? {}),
      ...(patch.playboundDiscord ?? {}),
    },
  };
}

/** Coerce CMS/seed LauncherInstall into the Zod/GamePayload shape (no undefined). */
export function toPayloadLauncherInstall(
  li: LauncherInstall | null | undefined
): GamePayloadLauncherInstall | null {
  if (!li?.kind) return null;
  return {
    enabled: li.enabled !== false,
    kind: li.kind,
    repo: li.repo ?? null,
    assetPattern: li.assetPattern ?? null,
    exeHint: li.exeHint ?? null,
    url: li.url ?? null,
    fileName: li.fileName ?? null,
    versionLabel: li.versionLabel ?? null,
    knownExePaths: li.knownExePaths ?? [],
    registryTitles: li.registryTitles ?? [],
    installRoot: li.installRoot ?? null,
    connectArgs: li.connectArgs ?? [],
    note: li.note ?? null,
    detectedVersion: li.detectedVersion ?? null,
    versionCheckStatus: li.versionCheckStatus ?? null,
    versionCheckNote: li.versionCheckNote ?? null,
    autoUpdatePinned: li.autoUpdatePinned !== false,
    overlayUrl: li.overlayUrl ?? null,
    overlayFileName: li.overlayFileName ?? null,
    overlayDest: li.overlayDest ?? null,
  };
}

export function withDefaultArt(payload: GamePayload): GamePayload & { art: NonNullable<GamePayload["art"]> } {
  return {
    ...payload,
    art: payload.art ?? defaultArtFor(payload.genres as Genre[], payload.slug),
  };
}

/** Ensure PC installable games always get a launcherInstall recipe. */
export function withDefaultLauncherInstall(payload: GamePayload): GamePayload {
  if (!isPcInstallCandidate(payload)) {
    return { ...payload, launcherInstall: toPayloadLauncherInstall(payload.launcherInstall) };
  }
  if (payload.launcherInstall?.kind) {
    const li = { ...payload.launcherInstall };
    if ((li.kind === "github-zip" || li.kind === "github-installer" || li.kind === "github-jar") && !li.repo) {
      li.repo = payload.githubRepo || null;
    }
    if (li.kind === "external" && !li.url) {
      li.url = payload.website;
    }
    return { ...payload, launcherInstall: toPayloadLauncherInstall(li) };
  }
  return {
    ...payload,
    launcherInstall: toPayloadLauncherInstall(defaultLauncherInstallForWebsite(payload.website)),
  };
}

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
  developerSlug: "indie-web",
  developerName: null,
  genres: [],
  tags: [],
  aliases: [],
  license: "Free / Open Source",
  releaseYear: new Date().getFullYear(),
  sizeMB: 0,
  platforms: ["Windows"],
  features: [],
  launchMethods: ["install"],
  browserPlayable: false,
  steamDeck: false,
  website: "https://example.com",
  steamAppId: null,
  androidStoreUrl: null,
  iosStoreUrl: null,
  githubRepo: null,
  communityLinks: null,
  gameOfWeek: false,
  hiddenGem: false,
  complete: false,
  art: defaultArtFor([], ""),
  coverImage: null,
  screenshots: [],
  videos: [],
  systemRequirements: {
    min: "See official site",
    recommended: "See official site",
  },
  hardwareRequirements: null,
  launcherInstall: null,
  serverLobbyAuth: null,
  published: false,
  status: "draft",
  submissionId: null,
  managedBy: "admin",
  ownerUserId: null,
  qualityBar: null,
  longDescription: undefined,
  whyWePickedIt: undefined,
  installSteps: [],
  faq: [],
  bestFor: [],
  notFor: [],
  comparableTo: [],
});
