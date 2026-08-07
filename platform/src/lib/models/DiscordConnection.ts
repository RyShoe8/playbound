import { Schema, model, models } from "mongoose";

const DiscordConnectionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  globalName: { type: String, default: null },
  avatar: { type: String, default: null },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  linkedAt: { type: Date, default: Date.now },
});

const DiscordConnection = models.DiscordConnection || model("DiscordConnection", DiscordConnectionSchema);
export default DiscordConnection;
