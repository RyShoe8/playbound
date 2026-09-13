import { Schema, model, models } from "mongoose";

const MultiplayerSignalSchema = new Schema(
  {
    signalId: { type: String, required: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    senderRole: { type: String, enum: ["host", "client"], required: true },
    recipientRole: { type: String, enum: ["host", "client"], required: true },
    senderPeerId: { type: String, required: true, maxlength: 100 },
    payload: { type: String, required: true, maxlength: 100_000 },
    timestamp: { type: Number, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: false }
);

MultiplayerSignalSchema.index({ sessionId: 1, recipientRole: 1, timestamp: 1 });

const MultiplayerSignal =
  models.MultiplayerSignal ||
  model("MultiplayerSignal", MultiplayerSignalSchema);

export default MultiplayerSignal;
