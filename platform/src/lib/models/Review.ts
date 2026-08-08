import { Schema, model, models } from "mongoose";

const ReviewSchema = new Schema({
  /** Null when this review is about gear (see gearSlug). */
  gameSlug: { type: String, default: null, index: true },
  /**
   * The edition being reviewed, or null for a review of the game as a whole.
   *
   * Null is the backwards-compatible case: every review written before
   * editions existed has no value here and stays attached to the game, which
   * is what it was always about. Reviews written from an edition page carry
   * that edition's slug, so "is Turtle WoW any good" becomes answerable
   * separately from "is World of Warcraft any good".
   *
   * Stored as a slug rather than an ObjectId to match how editions are
   * referenced everywhere else, and so a review survives an edition being
   * deleted and recreated under the same slug.
   */
  editionSlug: { type: String, default: null, index: true },
  /**
   * When set, this review is about a catalog mod (not the base game / edition).
   * gameSlug still stores the mod's baseGameSlug for reporting. List/create on
   * mod pages filter strictly by modSlug.
   */
  modSlug: { type: String, default: null, index: true },
  /**
   * When set, this review is about a gear product. Game/mod reviews keep this null.
   * gameSlug is null for gear-scoped reviews.
   */
  gearSlug: { type: String, default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

/**
 * One review per user per (game, edition, mod, gear) tuple.
 * - Game-level: editionSlug null, modSlug null, gearSlug null
 * - Edition: editionSlug set, modSlug null
 * - Mod: modSlug set (editionSlug null); gameSlug = base game
 * - Gear: gearSlug set; gameSlug null
 */
ReviewSchema.index(
  { gameSlug: 1, editionSlug: 1, modSlug: 1, gearSlug: 1, userId: 1 },
  { unique: true }
);
ReviewSchema.index({ modSlug: 1, userId: 1 }, { unique: true, partialFilterExpression: { modSlug: { $type: "string" } } });
ReviewSchema.index(
  { gearSlug: 1, userId: 1 },
  { unique: true, partialFilterExpression: { gearSlug: { $type: "string" } } }
);

const Review = models.Review || model("Review", ReviewSchema);
export default Review;
