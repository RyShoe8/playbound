import { Schema, model, models } from "mongoose";
import { COMMERCE_STORE_SLUGS } from "@/lib/commerce/stores";

/**
 * Configuration for an external game store / provider.
 *
 * Seeded once. Admin toggles matching, price refresh, and (for stores without
 * a public API) a product feed URL. Adding a brand-new protocol still needs
 * a code adapter — this document does not invent one.
 */
const StoreProviderSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: [...COMMERCE_STORE_SLUGS],
    },
    name: { type: String, required: true },
    logoUrl: { type: String, default: null },
    baseUrl: { type: String, required: true },
    color: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
    matchingEnabled: { type: Boolean, default: false },
    priceRefreshEnabled: { type: Boolean, default: false },
    affiliateDefault: { type: Boolean, default: true },
    discovery: { type: String, enum: ["api", "feed", "manual"], default: "manual" },
    feedUrl: { type: String, default: null },
  },
  { timestamps: true }
);

const StoreProvider = models.StoreProvider || model("StoreProvider", StoreProviderSchema);
export default StoreProvider;
