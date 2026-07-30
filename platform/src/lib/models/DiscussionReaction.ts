import { Schema, model, models, type Types } from "mongoose";

export interface DiscussionReactionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: "topic" | "reply";
  targetId: Types.ObjectId;
  reaction: "helpful";
  createdAt: Date;
}

const DiscussionReactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["topic", "reply"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reaction: { type: String, enum: ["helpful"], default: "helpful" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DiscussionReactionSchema.index(
  { userId: 1, targetType: 1, targetId: 1, reaction: 1 },
  { unique: true }
);
DiscussionReactionSchema.index({ targetType: 1, targetId: 1 });

const DiscussionReaction =
  models.DiscussionReaction || model("DiscussionReaction", DiscussionReactionSchema);
export default DiscussionReaction;
