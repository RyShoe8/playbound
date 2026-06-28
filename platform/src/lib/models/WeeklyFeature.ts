import { Schema, model, models } from "mongoose";

const WeeklyFeatureSchema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: "Game" },
  week: Number,
  year: Number,
  title: String,
  description: String,
  content: String,
  newsletterSent: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  publishDate: Date
});

const WeeklyFeature = models.WeeklyFeature || model("WeeklyFeature", WeeklyFeatureSchema);
export default WeeklyFeature;
