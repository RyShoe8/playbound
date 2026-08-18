import { Schema, model, models } from "mongoose";

/**
 * Ambiguous catalog ↔ store matches waiting for an admin to pick.
 *
 * Unique high-confidence hits write themselves. Everything else lands here
 * instead of guessing.
 */
const CandidateSchema = new Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    externalId: { type: String, default: "" },
    priceCents: { type: Number, default: null },
    listPriceCents: { type: Number, default: null },
  },
  { _id: false }
);

const StoreMatchSuggestionSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    gameTitle: { type: String, required: true },
    store: { type: String, required: true },
    retailer: { type: String, required: true },
    candidates: { type: [CandidateSchema], default: [] },
    status: { type: String, enum: ["pending", "accepted", "dismissed"], default: "pending", index: true },
  },
  { timestamps: true }
);

StoreMatchSuggestionSchema.index({ gameSlug: 1, store: 1, status: 1 });

const StoreMatchSuggestion =
  models.StoreMatchSuggestion || model("StoreMatchSuggestion", StoreMatchSuggestionSchema);
export default StoreMatchSuggestion;
