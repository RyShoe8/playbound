import { Schema, model, models } from "mongoose";

const ReviewSchema = new Schema({
  gameSlug: { type: String, required: true, index: true },
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
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

/**
 * One review per user per edition, plus one per user for the game itself
 * (editionSlug: null).
 *
 * This supersedes the old { gameSlug, userId } unique index, which would have
 * stopped someone reviewing both the Official and the Turtle WoW editions of
 * the same game. Mongo does not drop a superseded index automatically, so
 * until `npm run migrate:review-index` runs the old one-review-per-game
 * constraint is still enforced by the database.
 */
ReviewSchema.index({ gameSlug: 1, editionSlug: 1, userId: 1 }, { unique: true });

const Review = models.Review || model("Review", ReviewSchema);
export default Review;
