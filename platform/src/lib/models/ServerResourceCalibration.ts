import { Schema, model, models } from "mongoose";

/** Recoverable copies of operational measurements only; no catalog/user data. */
const schema = new Schema({
  requestId: { type: String, required: true, unique: true },
  actorId: { type: String, required: true },
  resetAt: { type: Date, required: true },
  profiles: { type: [Schema.Types.Mixed], required: true },
}, { timestamps: false });
export default models.ServerResourceCalibration || model("ServerResourceCalibration", schema);
