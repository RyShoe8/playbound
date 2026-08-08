import { Schema, model, models, type Types } from "mongoose";
import {
  DISCUSSION_CATEGORIES,
  type DiscussionCategory,
} from "@/lib/discussion/categories";

export { DISCUSSION_CATEGORIES, type DiscussionCategory };

export const TOPIC_STATUSES = ["open", "locked", "archived", "removed"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface DiscussionTopicDoc {
  _id: Types.ObjectId;
  /** Null when topic is gear-scoped (see gearSlug). */
  gameSlug?: string | null;
  modSlug?: string | null;
  /** When set, topic belongs to an edition page; null = base game. */
  editionSlug?: string | null;
  /** When set, topic belongs to a gear product page. */
  gearSlug?: string | null;
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
    /** Null when topic is gear-scoped. */
    gameSlug: { type: String, default: null, index: true },
    /** When set, topic belongs to a catalog mod; gameSlug is the base game. */
    modSlug: { type: String, default: null, index: true },
    /** When set, topic belongs to an edition; null = base-game discussion. */
    editionSlug: { type: String, default: null, index: true },
    /** When set, topic belongs to a gear product; gameSlug is null. */
    gearSlug: { type: String, default: null, index: true },
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
DiscussionTopicSchema.index({ modSlug: 1, status: 1, lastReplyAt: -1 });
DiscussionTopicSchema.index({ gearSlug: 1, status: 1, lastReplyAt: -1 });
DiscussionTopicSchema.index({ authorId: 1, createdAt: -1 });
// Unique topic slug per game / edition / mod / gear scope.
DiscussionTopicSchema.index(
  { gameSlug: 1, modSlug: 1, editionSlug: 1, gearSlug: 1, slug: 1 },
  { unique: true }
);
DiscussionTopicSchema.index(
  { modSlug: 1, slug: 1 },
  { unique: true, partialFilterExpression: { modSlug: { $type: "string" } } }
);
DiscussionTopicSchema.index(
  { gearSlug: 1, slug: 1 },
  { unique: true, partialFilterExpression: { gearSlug: { $type: "string" } } }
);
DiscussionTopicSchema.index({ title: "text", body: "text", tags: "text" });

const DiscussionTopic =
  models.DiscussionTopic || model("DiscussionTopic", DiscussionTopicSchema);
export default DiscussionTopic;
