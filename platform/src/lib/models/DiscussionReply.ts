import { Schema, model, models, type Types } from "mongoose";

export const REPLY_STATUSES = ["published", "edited", "removed"] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export interface DiscussionReplyDoc {
  _id: Types.ObjectId;
  topicId: Types.ObjectId;
  gameSlug: string;
  authorId: Types.ObjectId;
  authorUsername: string;
  body: string;
  quotedReplyId?: Types.ObjectId | null;
  replyToUserId?: Types.ObjectId | null;
  replyToUsername?: string | null;
  isAcceptedSolution: boolean;
  status: ReplyStatus;
  editHistory?: { body: string; editedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const EditHistorySchema = new Schema(
  {
    body: { type: String, required: true },
    editedAt: { type: Date, required: true },
  },
  { _id: false }
);

const DiscussionReplySchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "DiscussionTopic", required: true, index: true },
    gameSlug: { type: String, required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorUsername: { type: String, required: true },
    body: { type: String, required: true, maxlength: 10000 },
    quotedReplyId: { type: Schema.Types.ObjectId, ref: "DiscussionReply", default: null },
    replyToUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    replyToUsername: { type: String, default: null },
    isAcceptedSolution: { type: Boolean, default: false },
    status: {
      type: String,
      enum: REPLY_STATUSES,
      default: "published",
    },
    editHistory: { type: [EditHistorySchema], default: [] },
  },
  { timestamps: true }
);

DiscussionReplySchema.index({ topicId: 1, createdAt: 1 });
DiscussionReplySchema.index({ authorId: 1, createdAt: -1 });

const DiscussionReply =
  models.DiscussionReply || model("DiscussionReply", DiscussionReplySchema);
export default DiscussionReply;
