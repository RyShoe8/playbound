import { Schema, model, models } from "mongoose";

/**
 * A time-limited free-game offer from an external store.
 *
 * Offers are never deleted — expired ones become `isActive: false` and remain
 * as historical records. A game can have many offers across stores and time.
 */
const FreeOfferSchema = new Schema(
  {
    /** Linked CatalogGame. Null when the offer hasn't been matched yet. */
    gameId: { type: Schema.Types.ObjectId, ref: "CatalogGame", default: null, index: true },
    /** Denormalized slug for fast queries without a join. */
    gameSlug: { type: String, default: null, index: true },
    /** Title from the store — kept even after matching for audit/display. */
    unmatchedTitle: { type: String, default: null },

    store: {
      type: String,
      enum: ["epic", "steam", "gog", "prime_gaming"],
      required: true,
      index: true,
    },
    offerType: {
      type: String,
      enum: ["free_to_keep", "free_weekend", "free_trial", "free_with_subscription"],
      required: true,
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    claimUrl: { type: String, required: true },
    storeUrl: { type: String, default: null },

    isActive: { type: Boolean, default: true, index: true },
    lastVerified: { type: Date, default: Date.now },

    /** How the offer was discovered, e.g. "epic-promotions-api". */
    source: { type: String, default: null },
    /** Store-specific ID (Epic offer id, Steam appid, etc.). */
    externalId: { type: String, required: true },

    // ── Pricing ─────────────────────────────────────────────────────
    /** Formatted original price, e.g. "$29.99". */
    retailPrice: { type: String, default: null },
    /** Price in cents for sorting/filtering. */
    retailPriceValue: { type: Number, default: null },
    currency: { type: String, default: "USD" },

    // ── Game metadata (from store, denormalized) ────────────────────
    coverImage: { type: String, default: null },
    description: { type: String, default: null },
    developer: { type: String, default: null },
    publisher: { type: String, default: null },
    platforms: { type: [String], default: [] },
    isBaseGame: { type: Boolean, default: true },

    /** Videos from the store listing — trailers, gameplay clips. */
    videos: { type: [String], default: [] },

    // ── Prime Gaming specifics ──────────────────────────────────────
    /** For Prime Gaming cross-platform offers: "epic", "gog", "amazon_games". */
    redemptionPlatform: { type: String, default: null },

    // ── Matching ────────────────────────────────────────────────────
    matchConfidence: {
      type: String,
      enum: ["exact", "high", "low", "unmatched"],
      default: "unmatched",
    },

    // ── Editorial (future) ──────────────────────────────────────────
    featured: { type: Boolean, default: false },
    editorialNote: { type: String, default: null },
    qualityScore: { type: Number, default: null },

    /** Provider-specific extra data that doesn't fit typed fields. */
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Unique per store + external ID — prevents duplicate offers.
FreeOfferSchema.index({ store: 1, externalId: 1 }, { unique: true });
// Fast active-offer queries for the homepage.
FreeOfferSchema.index({ isActive: 1, endDate: 1 });
// Per-game offer lookups (detail page, matching).
FreeOfferSchema.index({ gameSlug: 1, isActive: 1 });

const FreeOffer = models.FreeOffer || model("FreeOffer", FreeOfferSchema);
export default FreeOffer;
