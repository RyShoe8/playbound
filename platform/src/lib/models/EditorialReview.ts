import { Schema, model, models } from "mongoose";

/**
 * A published review of a game or edition by an outside outlet — the
 * Metacritic-style "Editorial Rating" source.
 *
 * Kept apart from Review (player reviews) on purpose: these are curated by
 * admins, link out to the full review on the outlet's own site, and carry the
 * outlet's original score so it can be shown as published and normalised to
 * 0–100 only for the aggregate.
 *
 * `editionSlug` null means the review is of the base game. A review of a fork
 * or remaster that lives as an edition (OpenMW, Turtle WoW) carries that
 * edition's slug, so its score never leaks into the base game's rating.
 */
const EditorialReviewSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null, index: true },
    outlet: { type: String, required: true, maxlength: 80 },
    author: { type: String, default: null, maxlength: 80 },
    url: { type: String, required: true, maxlength: 2000 },
    /**
     * A short excerpt from the review, shown with a link to the rest. Automated
     * imports use the outlet's own share description and may have none.
     */
    snippet: { type: String, default: null, maxlength: 400 },
    /** The outlet's own score, or null for an unscored review (shown, not averaged). */
    score: { type: Number, default: null, min: 0 },
    /** What the outlet scores out of: 100, 10, 5… */
    scoreMax: { type: Number, default: null, min: 1 },
    /** Printed score when it is not a number, e.g. a letter grade ("B+"). */
    scoreText: { type: String, default: null, maxlength: 20 },
    publishedAt: { type: Date, default: null },
    /**
     * "manual" from the admin form; "wikipedia" from a reviews table; "outlet"
     * read from the outlet's own site.
     */
    source: { type: String, enum: ["manual", "wikipedia", "outlet"], default: "manual", index: true },
    /** The Wikipedia article or outlet site an automated row came from. */
    sourceRef: { type: String, default: null },
    status: { type: String, enum: ["published", "hidden"], default: "published", index: true },
    addedBy: { type: String, default: null },
  },
  { timestamps: true }
);

// One entry per review URL per target: re-adding the same link is an edit, not a duplicate.
EditorialReviewSchema.index({ gameSlug: 1, editionSlug: 1, url: 1 }, { unique: true });

const EditorialReview = models.EditorialReview || model("EditorialReview", EditorialReviewSchema);
export default EditorialReview;
