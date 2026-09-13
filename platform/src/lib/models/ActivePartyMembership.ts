import { Schema, model, models, type Types } from "mongoose";

/**
 * Atomic ownership record for a user's one allowed active party.
 *
 * Party.members remains the roster rendered by clients. This small collection
 * is the concurrency guard: its unique userId index prevents simultaneous
 * requests from adding one user to two live rosters.
 */
const ActivePartyMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    partyId: {
      type: Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

export type ActivePartyMembershipDoc = {
  userId: Types.ObjectId;
  partyId: Types.ObjectId;
};

const ActivePartyMembership =
  models.ActivePartyMembership ||
  model("ActivePartyMembership", ActivePartyMembershipSchema);

export default ActivePartyMembership;
