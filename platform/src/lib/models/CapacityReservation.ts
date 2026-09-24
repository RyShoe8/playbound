import { Schema, model, models } from "mongoose";

const CapacityReservationSchema = new Schema({
  sourceKey: { type: String, required: true, unique: true },
  eventId: { type: Schema.Types.ObjectId, ref: "PlatformEvent", required: true, index: true },
  communityServerId: { type: Schema.Types.ObjectId, ref: "CommunityServer", default: null },
  profileKey: { type: String, required: true },
  regionKey: { type: String, required: true },
  cpuCores: { type: Number, required: true, min: 0 },
  ramBytes: { type: Number, required: true, min: 0 },
  warmupAt: { type: Date, required: true },
  protectedUntil: { type: Date, required: true },
  state: { type: String, enum: ["planned", "active", "released", "missed"], default: "planned" },
  decisionReason: { type: String, default: null },
}, { timestamps: true });

CapacityReservationSchema.index({ regionKey: 1, state: 1, warmupAt: 1 });

export default models.CapacityReservation || model("CapacityReservation", CapacityReservationSchema);
