import { Schema, model, models } from "mongoose";

/** Serializes capacity decisions per region across Vercel instances. */
const DedicatedCapacityLeaseSchema = new Schema({
  regionKey: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  leaseUntil: { type: Date, required: true },
}, { timestamps: true });

export default models.DedicatedCapacityLease || model("DedicatedCapacityLease", DedicatedCapacityLeaseSchema);
