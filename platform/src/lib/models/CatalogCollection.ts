import { Schema, model, models } from "mongoose";

/**
 * A curated grouping of catalog games ("Best Free RTS Games").
 *
 * Previously these lived only in src/lib/data/collections.ts, which meant a
 * game rename silently dropped it from every list it appeared in and there was
 * no way to change a collection without a deploy.
 */
const CatalogCollectionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    /** Ordered game slugs. Order is meaningful — it is the ranking shown. */
    gameSlugs: { type: [String], default: [], index: true },
    published: { type: Boolean, default: true, index: true },
    /** Ascending. Ties fall back to title. */
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const CatalogCollection =
  models.CatalogCollection || model("CatalogCollection", CatalogCollectionSchema);
export default CatalogCollection;
