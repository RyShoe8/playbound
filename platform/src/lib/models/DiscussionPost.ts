import { Schema, model, models } from "mongoose";

const DiscussionPostSchema = new Schema({
  gameSlug: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  title: { type: String, required: true, maxlength: 150 },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

const DiscussionPost = models.DiscussionPost || model("DiscussionPost", DiscussionPostSchema);
export default DiscussionPost;
