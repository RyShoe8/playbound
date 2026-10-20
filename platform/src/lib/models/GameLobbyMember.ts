import { Schema, model, models } from "mongoose";

const schema = new Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, enum: ["online", "playing"], default: "online" },
  sessionId: { type: String, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export default models.HyperdiscLobbyMember || model("HyperdiscLobbyMember", schema);
