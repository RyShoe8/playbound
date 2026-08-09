import { Schema, model, models, type Types } from "mongoose";
import { PLAY_INVITE_STATUSES } from "@/lib/playTogether/types";

/**
 * Lightweight play invite — not chat.
 * Sender asks recipient to play a specific game (optional edition/mod).
 */
const PlayInviteSchema = new Schema(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null },
    modSlug: { type: String, default: null },
    status: {
      type: String,
      enum: PLAY_INVITE_STATUSES,
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PlayInviteSchema.index(
  { senderId: 1, recipientId: 1, gameSlug: 1, status: 1 },
  { partialFilterExpression: { status: "pending" } }
);

export type PlayInviteDoc = {
  _id: Types.ObjectId;
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
  status: string;
  expiresAt: Date;
  respondedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const PlayInvite = models.PlayInvite || model("PlayInvite", PlayInviteSchema);
export default PlayInvite;
