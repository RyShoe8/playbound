import { Schema, model, models } from "mongoose";

const CommunityHostingLeaseSchema = new Schema({
  key: { type: String, required: true, unique: true },
  leaseUntil: { type: Date, required: true },
  owner: { type: String, required: true },
}, { timestamps: true });

export default models.CommunityHostingLease || model("CommunityHostingLease", CommunityHostingLeaseSchema);
