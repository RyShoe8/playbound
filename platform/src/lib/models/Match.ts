import { Schema, model, models } from "mongoose";

const MatchSchema = new Schema({
  gameId: { type: String, required: true },
  roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
  players: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      score: { type: Number, default: 0 }
    }
  ],
  winner: { type: Schema.Types.ObjectId, ref: "User" },
  startedAt: { type: Date },
  endedAt: { type: Date, default: Date.now }
});

const Match = models.Match || model("Match", MatchSchema);
export default Match;
