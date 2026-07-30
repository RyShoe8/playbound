import { Schema, model, models } from "mongoose";

const ReviewSchema = new Schema({
  gameSlug: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

ReviewSchema.index({ gameSlug: 1, userId: 1 }, { unique: true });

const Review = models.Review || model("Review", ReviewSchema);
export default Review;
