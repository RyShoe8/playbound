import { Schema, model, models } from "mongoose";
import { HardwareRequirementsBlockSchema } from "@/lib/models/hardwareRequirementsSchema";
import { LAUNCHER_INSTALL_KINDS } from "@/lib/launcherInstall";

const GameArtSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { _id: false }
);

const SystemRequirementsSchema = new Schema(
  {
    min: { type: String, required: true },
    recommended: { type: String, required: true },
  },
  { _id: false }
);

const LauncherInstallSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    kind: {
      type: String,
      enum: LAUNCHER_INSTALL_KINDS,
      required: true,
    },
    repo: { type: String, default: null },
    assetPattern: { type: String, default: null },
    exeHint: { type: String, default: null },
    url: { type: String, default: null },
    fileName: { type: String, default: null },
    versionLabel: { type: String, default: null },
    knownExePaths: { type: [String], default: [] },
    registryTitles: { type: [String], default: [] },
    installRoot: { type: String, default: null },
    connectArgs: { type: [String], default: [] },
    note: { type: String, default: null },
    detectedVersion: { type: String, default: null },
    lastVersionCheckAt: { type: Date, default: null },
    versionCheckStatus: {
      type: String,
      enum: ["ok", "stale", "broken", "skipped", "updated"],
      default: null,
    },
    versionCheckNote: { type: String, default: null },
    autoUpdatePinned: { type: Boolean, default: true },
    overlayUrl: { type: String, default: null },
    overlayFileName: { type: String, default: null },
    overlayDest: { type: String, default: null },
  },
  { _id: false }
);

/** Score against the published PlayBound Bar criteria. */
const QualityBarSchema = new Schema(
  {
    genuinelyFree: { type: Boolean, default: false },
    finished: { type: Boolean, default: false },
    activelyMaintained: { type: Boolean, default: false },
    standsAlone: { type: Boolean, default: false },
    highQuality: { type: Boolean, default: false },
    /** Legacy field — kept so older Mongo docs still load; read via normalizeQualityBar. */
    wontDisappear: { type: Boolean, default: false },
    verdict: { type: String, default: "" },
    lastVerified: { type: String, default: "" },
  },
  { _id: false }
);

const InstallStepSchema = new Schema(
  {
    platform: { type: String, enum: ["all", "windows", "macos", "linux"], default: "all" },
    text: { type: String, required: true },
    command: { type: String, default: null },
  },
  { _id: false }
);

const FaqSchema = new Schema(
  {
    q: { type: String, required: true },
    a: { type: String, required: true },
  },
  { _id: false }
);

/** Lobby login for Zero-K / 0 A.D. server listings (admin-only; not public). */
const ServerLobbyAuthSchema = new Schema(
  {
    username: { type: String, default: null },
    password: { type: String, default: null },
  },
  { _id: false }
);

const CatalogGameSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    /**
     * Slugs this game used to live at. Renaming would otherwise 404 every
     * indexed URL, inbound link and shared page for the old slug, so the old
     * value is kept here and /games/[slug] 301s from it to the current one.
     */
    previousSlugs: { type: [String], default: [], index: true },
    title: { type: String, required: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    developerSlug: { type: String, required: true },
    developerName: { type: String, default: null },
    genres: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    /** Alternate search names — "WoW", "C&C". Indexed; never displayed. */
    aliases: { type: [String], default: [], index: true },
    license: { type: String, required: true },
    releaseYear: { type: Number, required: true },
    sizeMB: { type: Number, required: true },
    platforms: { type: [String], default: [] },
    features: { type: [String], default: [] },
    launchMethods: { type: [String], default: [] },
    browserPlayable: { type: Boolean, default: false },
    steamDeck: { type: Boolean, default: false },
    website: { type: String, required: true },
    steamAppId: { type: String, default: null },
    androidStoreUrl: { type: String, default: null },
    iosStoreUrl: { type: String, default: null },
    githubRepo: { type: String, default: null },
    gameOfWeek: { type: Boolean, default: false },
    hiddenGem: { type: Boolean, default: false },
    /** Admin checklist: catalog info for this title is fully entered. */
    complete: { type: Boolean, default: false },
    /*
     * How the game is acquired. Absent on every existing document, and absent
     * reads as free — which is what the catalog was when this was added, so
     * nothing changes until a game is deliberately classified.
     *
     * Prices are cents. Nothing here decides Free vs Value on its own; the
     * resolver in lib/access does, because it can see dependencies this
     * document cannot.
     */
    access: {
      priceType: {
        type: String,
        enum: ["FREE", "PAID", "PAID_BASE_GAME_REQUIRED"],
      },
      regularPriceCents: { type: Number, default: null },
      currentPriceCents: { type: Number, default: null },
      /** Judged against the ceiling — deliberately not the sale price. */
      qualifyingPriceCents: { type: Number, default: null },
      currency: { type: String, default: "USD" },
      purchaseRequired: { type: Boolean, default: false },
      requiresBaseGameAssets: { type: Boolean, default: false },
      requiresOwnedBaseGame: { type: Boolean, default: false },
      /** Slugs of games this one cannot be played without. */
      requiresGameSlugs: { type: [String], default: [] },
    },
    /*
     * `opsHealth` used to live here — a stored triage light that failures set
     * to yellow and only a human click cleared. The admin lights are derived
     * from telemetry now (lib/admin/gameOpsHealth.ts), so the field is gone
     * from the schema. Existing documents keep theirs harmlessly; nothing
     * reads it.
     */
    art: { type: GameArtSchema, required: true },
    coverImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    systemRequirements: { type: SystemRequirementsSchema, required: true },
    /** Optional structured requirements for the compatibility engine (additive to free-text). */
    hardwareRequirements: { type: HardwareRequirementsBlockSchema, default: null },
    launcherInstall: { type: LauncherInstallSchema, default: null },
    serverLobbyAuth: { type: ServerLobbyAuthSchema, default: null },
    installCount: { type: Number, default: 0 },

    // Editorial depth — see SEO-STRATEGY.md §4.3.
    qualityBar: { type: QualityBarSchema, default: null },
    longDescription: { type: String, default: null },
    whyWePickedIt: { type: String, default: null },
    installSteps: { type: [InstallStepSchema], default: [] },
    faq: { type: [FaqSchema], default: [] },
    bestFor: { type: [String], default: [] },
    notFor: { type: [String], default: [] },
    comparableTo: { type: [String], default: [] },
    published: { type: Boolean, default: true, index: true },
    /**
     * When this game was last moved to published.
     *
     * The admin list had a Published column but nothing to put in it, so it
     * showed createdAt — which for an imported game is the day the row was
     * written, not the day anyone published it. Set whenever status becomes
     * published; left alone otherwise, so unpublishing does not erase it.
     */
    publishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["draft", "watchlist", "testing", "published"],
      default: "published",
      index: true,
    },
    /**
     * Whether PlayBound actively supports this game (launcher, editions, mods,
     * compatibility profiles, etc.). Games discovered solely through free
     * promotions enter the catalog with `false` — they appear in free-game
     * views but not in the main curated catalog or discover page.
     */
    playboundSupported: { type: Boolean, default: true, index: true },
    /** Epic Games Store product page URL (for matching). */
    epicStoreUrl: { type: String, default: null },
    /** GOG product page URL (for matching). */
    gogStoreUrl: { type: String, default: null },
    /** Store-specific IDs for cross-platform matching. */
    externalIds: {
      epic: { type: String, default: null },
      steam: { type: String, default: null },
      gog: { type: String, default: null },
    },
    submissionId: { type: Schema.Types.ObjectId, ref: "GameSubmission", default: null },
    managedBy: { type: String, enum: ["admin", "developer"], default: "admin" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    communityLinks: {
      officialDiscord: {
        inviteUrl: { type: String, default: null },
        serverName: { type: String, default: null },
        verified: { type: Boolean, default: false },
        verifiedSourceUrl: { type: String, default: null },
        verifiedAt: { type: Date, default: null },
      },
      playboundDiscord: {
        guildId: { type: String, default: null },
        channelId: { type: String, default: null },
        channelName: { type: String, default: null },
        inviteCode: { type: String, default: null },
        inviteUrl: { type: String, default: null },
        provisionedAt: { type: Date, default: null },
      },
    },
  },
  { timestamps: true }
);

const CatalogGame = models.CatalogGame || model("CatalogGame", CatalogGameSchema);
export default CatalogGame;
