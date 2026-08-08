import { Schema, model, models } from "mongoose";

const GuidePostSchema = new Schema({
  gameSlug: { type: String, required: true, index: true },
  /** When set, guide belongs to a catalog mod; gameSlug is the base game. */
  modSlug: { type: String, default: null, index: true },
  /** When set, guide belongs to an edition; null = base-game guide. */
  editionSlug: { type: String, default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  title: { type: String, required: true, maxlength: 150 },
  body: { type: String, required: true, maxlength: 8000 },
  createdAt: { type: Date, default: Date.now },
});

const GuidePost = models.GuidePost || model("GuidePost", GuidePostSchema);
export default GuidePost;
