import { Schema, model, models } from "mongoose";

const FriendSchema = new Schema(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "blocked"],
      required: true,
      index: true,
    },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Prevent duplicate friendships regardless of direction
// A user shouldn't be able to have two documents where they are both requester and recipient
// However, MongoDB unique indexes are directed. To handle this, we can enforce a rule where
// user1 < user2 or we can just create a compound unique index if we ensure order.
// Let's add a pre-save hook to ensure requesterId and recipientId are not the same
FriendSchema.pre("validate", function () {
  if (this.requesterId && this.recipientId && this.requesterId.toString() === this.recipientId.toString()) {
    throw new Error("Cannot create a friendship with yourself");
  }
});

// Create a compound index to quickly find any relationship between two specific users
FriendSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

const Friend = models.Friend || model("Friend", FriendSchema);
export default Friend;
