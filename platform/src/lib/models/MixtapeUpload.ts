import { Schema, model, models } from "mongoose";
const schema = new Schema({
  name: { type: String, required: true, unique: true }, userId: { type: String, required: true },
  size: { type: Number, required: true }, contentType: { type: String, required: true }, sha256: { type: String, required: true },
  sourceUrl: { type: String, default: "" },
  state: { type: String, enum: ["staging", "archiving", "promoting", "ready"], default: "staging" },
  leaseUntil: { type: Date, default: null },
}, { timestamps: true });
export default models.MixtapeUpload || model("MixtapeUpload", schema);
