import { Schema, model, models } from "mongoose";

const RoomSchema = new Schema({
  gameId: { type: String, required: true },
  hostId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  playerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  status: { type: String, enum: ["waiting", "in_progress", "finished"], default: "waiting" },
  createdAt: { type: Date, default: Date.now }
});

const Room = models.Room || model("Room", RoomSchema);
export default Room;
