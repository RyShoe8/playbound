import { Schema, model, models } from "mongoose";

/**
 * One row from an ingested store product feed.
 *
 * Used when the store has no catalog search API. Matching looks here instead
 * of calling out to the storefront.
 */
const StoreFeedProductSchema = new Schema(
  {
    store: { type: String, required: true, index: true },
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    priceCents: { type: Number, default: null },
    listPriceCents: { type: Number, default: null },
    ingestedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

StoreFeedProductSchema.index({ store: 1, externalId: 1 }, { unique: true });

const StoreFeedProduct = models.StoreFeedProduct || model("StoreFeedProduct", StoreFeedProductSchema);
export default StoreFeedProduct;
