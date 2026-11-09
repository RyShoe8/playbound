import { Schema, model, models } from "mongoose";

/**
 * Where the automated review sync looks for one game or edition, and how the
 * last run went. One row per target; created on first sync.
 *
 * `wikipediaTitle` pins the article when the automatic lookup would pick the
 * wrong one (or cannot find it); `disabled` stops syncing a target entirely.
 * Kept out of CatalogGame on purpose: the catalog is curated, this is
 * machine state.
 */
const EditorialReviewSourceSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null },
    wikipediaTitle: { type: String, default: null, maxlength: 300 },
    disabled: { type: Boolean, default: false },
    lastSyncAt: { type: Date, default: null, index: true },
    /** ok | no-article | no-table | error */
    lastStatus: { type: String, default: null },
    lastMessage: { type: String, default: null, maxlength: 500 },
    /** The article actually used on the last run. */
    matchedTitle: { type: String, default: null },
    foundCount: { type: Number, default: 0 },
    /** Outlets whose own site had a review of this target on the last run. */
    outletCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

EditorialReviewSourceSchema.index({ gameSlug: 1, editionSlug: 1 }, { unique: true });

const EditorialReviewSource =
  models.EditorialReviewSource || model("EditorialReviewSource", EditorialReviewSourceSchema);
export default EditorialReviewSource;
