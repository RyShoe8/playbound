import { Schema, model, models } from "mongoose";
import { COMMERCE_STORE_SLUGS } from "@/lib/commerce/stores";

/**
 * Configuration for an external game store / provider.
 *
 * Free-offer ingest and paid purchase matching are independent flags. An
 * affiliate ID is optional and only applied to paid outbound links.
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
    /** Legacy. Kept so older documents still load. Not used as a gate. */
    active: { type: Boolean, default: true, index: true },
    matchingEnabled: { type: Boolean, default: false },
    priceRefreshEnabled: { type: Boolean, default: false },
    freeOffersEnabled: { type: Boolean, default: false },
    affiliateDefault: { type: Boolean, default: true },
    affiliateId: { type: String, default: null },
    affiliateParam: { type: String, default: null },
    discovery: { type: String, enum: ["api", "feed", "manual"], default: "manual" },
    feedUrl: { type: String, default: null },
  },
  { timestamps: true }
);

const StoreProvider = models.StoreProvider || model("StoreProvider", StoreProviderSchema);
export default StoreProvider;
