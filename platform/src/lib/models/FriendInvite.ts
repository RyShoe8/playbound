import { Schema, model, models } from "mongoose";

const FriendInviteSchema = new Schema(
  {
    inviterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["pending", "accepted", "cancelled", "expired"],
      default: "pending",
      index: true,
    },
    friendshipId: { type: Schema.Types.ObjectId, ref: "Friend", default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

FriendInviteSchema.index({ email: 1, status: 1 });
FriendInviteSchema.index({ inviterId: 1, createdAt: -1 });
FriendInviteSchema.index({ inviterId: 1, email: 1, status: 1 });

const FriendInvite = models.FriendInvite || model("FriendInvite", FriendInviteSchema);
export default FriendInvite;
