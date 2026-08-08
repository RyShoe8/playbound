import { Schema, model, models } from "mongoose";

const FriendSchema = new Schema(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled", "blocked"],
      required: true,
      index: true,
    },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FriendSchema.pre("validate", function () {
  if (this.requesterId && this.recipientId && this.requesterId.toString() === this.recipientId.toString()) {
    throw new Error("Cannot create a friendship with yourself");
  }
});

FriendSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
FriendSchema.index({ recipientId: 1, status: 1 });
FriendSchema.index({ requesterId: 1, status: 1 });

const Friend = models.Friend || model("Friend", FriendSchema);
export default Friend;
