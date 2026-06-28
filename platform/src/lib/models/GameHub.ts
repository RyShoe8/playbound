import { Schema, model, models } from "mongoose";

const GameHubSchema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: "Game" },
  overview: String,
  installGuide: String,
  compatibility: String,
  faq: [String],
  lastUpdated: { type: Date, default: Date.now }
});

const GameHub = models.GameHub || model("GameHub", GameHubSchema);
export default GameHub;
