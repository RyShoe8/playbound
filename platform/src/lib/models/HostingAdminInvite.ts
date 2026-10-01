import { Schema, model, models } from "mongoose";

const HostingAdminInviteSchema = new Schema({
  subscriptionId: { type: Schema.Types.ObjectId, ref: "DedicatedSubscription", required: true, index: true },
  inviterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ["pending", "accepted", "cancelled", "expired"], default: "pending" },
  expiresAt: { type: Date, required: true },
  acceptedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

HostingAdminInviteSchema.index({ subscriptionId: 1, email: 1, status: 1 });
export default models.HostingAdminInvite || model("HostingAdminInvite", HostingAdminInviteSchema);
