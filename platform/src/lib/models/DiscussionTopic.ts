import { Schema, model, models, type Types } from "mongoose";

export const DISCUSSION_CATEGORIES = [
  "general",
  "help",
  "technical",
  "multiplayer",
  "servers",
  "mods",
  "guides",
  "feedback",
  "announcements",
] as const;

export type DiscussionCategory = (typeof DISCUSSION_CATEGORIES)[number];

export const TOPIC_STATUSES = ["open", "locked", "archived", "removed"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface DiscussionTopicDoc {
  _id: Types.ObjectId;
  gameSlug: string;
  authorId: Types.ObjectId;
  authorUsername: string;
  title: string;
  slug: string;
  body: string;
  category: DiscussionCategory;
  tags: string[];
  hasSpoilers: boolean;
  status: TopicStatus;
  isPinned: boolean;
  isSolved: boolean;
  acceptedReplyId?: Types.ObjectId | null;
  replyCount: number;
  viewCount: number;
  participantCount: number;
  lastReplyAt?: Date | null;
  lastReplyUserId?: Types.ObjectId | null;
  lastReplyUsername?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DiscussionTopicSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorUsername: { type: String, required: true },
    title: { type: String, required: true, maxlength: 150 },
    slug: { type: String, required: true },
    body: { type: String, required: true, maxlength: 10000 },
    category: {
      type: String,
      enum: DISCUSSION_CATEGORIES,
      required: true,
      default: "general",
    },
    tags: { type: [String], default: [] },
    hasSpoilers: { type: Boolean, default: false },
    status: {
      type: String,
      enum: TOPIC_STATUSES,
      default: "open",
      index: true,
    },
    isPinned: { type: Boolean, default: false },
    isSolved: { type: Boolean, default: false },
    acceptedReplyId: { type: Schema.Types.ObjectId, ref: "DiscussionReply", default: null },
    replyCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    participantCount: { type: Number, default: 1 },
    lastReplyAt: { type: Date, default: null },
    lastReplyUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastReplyUsername: { type: String, default: null },
  },
  { timestamps: true }
);

DiscussionTopicSchema.index({ gameSlug: 1, status: 1, lastReplyAt: -1 });
DiscussionTopicSchema.index({ gameSlug: 1, category: 1, lastReplyAt: -1 });
DiscussionTopicSchema.index({ gameSlug: 1, isPinned: -1, lastReplyAt: -1 });
DiscussionTopicSchema.index({ authorId: 1, createdAt: -1 });
DiscussionTopicSchema.index({ gameSlug: 1, slug: 1 }, { unique: true });
DiscussionTopicSchema.index({ title: "text", body: "text", tags: "text" });

const DiscussionTopic =
  models.DiscussionTopic || model("DiscussionTopic", DiscussionTopicSchema);
export default DiscussionTopic;
