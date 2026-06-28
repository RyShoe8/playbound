import { Schema, model, models } from "mongoose";

const GameSchema = new Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  type: { type: String, enum: ["browser", "classic", "mobile"], required: true },
  gameHubId: { type: Schema.Types.ObjectId, ref: "GameHub" },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Game = models.Game || model("Game", GameSchema);
export default Game;
