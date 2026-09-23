import { Schema, model, models } from "mongoose";

/**
 * A currently-discounted game found on an external store, independent of
 * PlayBound's own catalog.
 *
 * Deliberately not `FreeOffer`. `/deals`'s "On sale now" half used to be gated
 * by PlayBound's own ~18 paid games, which made it empty almost every day —
 * this is the store-wide replacement, so `matchedGameSlug` is optional
 * enrichment rather than a requirement the way `FreeOffer.gameSlug` is treated
 * as a match to pursue. A row with no catalog match is the normal case here,
 * not a gap to close.
 *
 * Same soft-expiry contract as `FreeOffer`: never deleted, `isActive` flips to
 * false when a fresh, non-empty scan no longer lists it. See
 * `storeDiscounts/ingestion.ts`.
 */
const StoreDiscountSchema = new Schema(
  {
    store: {
      type: String,
      // Kept in sync with storeDiscounts/types.ts DISCOUNT_STORE_SLUGS by
      // storeDiscounts/storeScope.test.ts.
      enum: ["gog", "steam", "epic", "gamersgate"],
      required: true,
      index: true,
    },
    /** Store-specific ID: GOG product id, or CheapShark's dealID. */
    externalId: { type: String, required: true },

    title: { type: String, required: true },
    /** Direct product page — never a third party's redirect. See gog.ts/cheapshark.ts. */
    storeUrl: { type: String, required: true },
    coverImage: { type: String, default: null },

    genres: { type: [String], default: [] },
    developers: { type: [String], default: [] },
    platforms: { type: [String], default: [] },

    currency: { type: String, default: "USD" },
    regularPriceCents: { type: Number, required: true },
    currentPriceCents: { type: Number, required: true },
    /** Whole percent off, floored — matches lib/dealsShared.ts percentOff(). */
    percentOff: { type: Number, required: true },

    /**
     * Best-effort link back to a PlayBound catalog game, when one happens to
     * exist. Never populated by a matching pass in V1 — deliberately null
     * until/unless that enrichment is built. Never gates whether a row shows.
     */
    matchedGameSlug: { type: String, default: null },

    isActive: { type: Boolean, default: true, index: true },
    lastVerified: { type: Date, default: Date.now },

    /** Provider-specific extra data that doesn't fit typed fields. */
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Unique per store + external ID — the upsert key, prevents duplicate rows.
StoreDiscountSchema.index({ store: 1, externalId: 1 }, { unique: true });
// The /deals read: active discounts, deepest first.
StoreDiscountSchema.index({ isActive: 1, percentOff: -1 });

const StoreDiscount = models.StoreDiscount || model("StoreDiscount", StoreDiscountSchema);
export default StoreDiscount;
