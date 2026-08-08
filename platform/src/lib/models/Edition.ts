import { Schema, model, models } from "mongoose";
import {
  EDITION_STATUSES,
  EDITION_TYPES,
  EDITION_VISIBILITIES,
  INSTALL_METHODS,
  VERIFICATION_LEVELS,
} from "@/lib/editionTypes";

const BrandingSchema = new Schema(
  {
    logo: { type: String, default: null },
    heroImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    artHue: { type: Number, default: null },
  },
  { _id: false }
);

const LinksSchema = new Schema(
  {
    website: { type: String, default: null },
    discord: { type: String, default: null },
    wiki: { type: String, default: null },
    github: { type: String, default: null },
    forum: { type: String, default: null },
  },
  { _id: false }
);

const RequirementsSchema = new Schema(
  {
    min: { type: String, default: null },
    recommended: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const PatchNoteSchema = new Schema(
  {
    version: { type: String, required: true },
    date: { type: String, default: null },
    title: { type: String, default: null },
    body: { type: String, default: null },
    url: { type: String, default: null },
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

/**
 * A specific way to play a Game — the official client, a community server
 * (Turtle WoW), a remaster, a curated build.
 *
 * Editions are separate documents rather than an array on CatalogGame: a game
 * can accumulate dozens, each with its own install config, patch notes and
 * screenshots, and embedding all of that would bloat every game read on the
 * home page and discover grid for data almost no reader needs.
 *
 * Games are identified by slug across this codebase (and static seed games
 * have no ObjectId at all), so both are stored: `gameId` gives a real
 * reference for population, `gameSlug` is what routing and the seed fallback
 * actually query on. The admin rename cascade keeps gameSlug in step.
 */
const EditionSchema = new Schema(
  {
    gameId: { type: Schema.Types.ObjectId, ref: "CatalogGame", default: null, index: true },
    gameSlug: { type: String, required: true, index: true },

    slug: { type: String, required: true },
    name: { type: String, required: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },

    type: { type: String, enum: EDITION_TYPES, default: "community", index: true },
    status: { type: String, enum: EDITION_STATUSES, default: "active", index: true },
    visibility: { type: String, enum: EDITION_VISIBILITIES, default: "public", index: true },

    sortOrder: { type: Number, default: 0 },
    /** Exactly one per game; enforced in the API, not by the schema. */
    isDefault: { type: Boolean, default: false },

    branding: { type: BrandingSchema, default: () => ({}) },
    links: { type: LinksSchema, default: () => ({}) },

    /**
     * PlayBound Discord guild channel for this edition (franchise hierarchy).
     * Distinct from links.discord (external community invite).
     */
    playboundDiscord: {
      guildId: { type: String, default: null },
      channelId: { type: String, default: null },
      channelName: { type: String, default: null },
      inviteCode: { type: String, default: null },
      inviteUrl: { type: String, default: null },
      provisionedAt: { type: Date, default: null },
    },

    installMethod: { type: String, enum: INSTALL_METHODS, default: "manual", index: true },
    /**
     * Per-method configuration, keyed by install method. Mixed on purpose:
     * adding a new install method must not require a schema migration, and
     * each method's shape is validated by zod at the API boundary instead.
     */
    installConfig: { type: Schema.Types.Mixed, default: () => ({}) },

    requirements: { type: RequirementsSchema, default: null },
    features: { type: [String], default: [] },
    tags: { type: [String], default: [], index: true },
    /** Alternate search names — "Turtle", "TWoW". Indexed; never displayed. */
    aliases: { type: [String], default: [], index: true },
    /** In-game server name, when this edition is a server. */
    serverName: { type: String, default: null, index: true },
    languages: { type: [String], default: [] },

    version: { type: String, default: null },
    patchNotes: { type: [PatchNoteSchema], default: [] },
    faq: { type: [FaqSchema], default: [] },

    verified: { type: Boolean, default: false },
    verificationLevel: {
      type: String,
      enum: VERIFICATION_LEVELS,
      default: "untested",
      index: true,
    },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    verificationNote: { type: String, default: null },

    /** Reserved for live player counts. Null means "unknown", never zero. */
    population: { type: Number, default: null },
  },
  { timestamps: true }
);

// An edition slug is unique per game, not globally — two games may each have
// an "official" edition.
EditionSchema.index({ gameSlug: 1, slug: 1 }, { unique: true });

// Listing a game's editions in display order is the hottest query.
EditionSchema.index({ gameSlug: 1, status: 1, visibility: 1, sortOrder: 1 });

// Search across everything a reader might type to find an edition.
EditionSchema.index({
  name: "text",
  shortDescription: "text",
  tags: "text",
  aliases: "text",
  serverName: "text",
});

const Edition = models.Edition || model("Edition", EditionSchema);
export default Edition;
