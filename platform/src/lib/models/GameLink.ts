import { Schema, model, models } from "mongoose";

/**
 * A pending "sign in to a game" request (device-code style). The game shows
 * `code` and polls with a secret `pollToken`; the player approves the code on
 * /link while signed in to the website. Only the poll token's hash is stored.
 */
const GameLinkSchema = new Schema(
  {
    /** Short, human-typable code shown in the game (8 chars, no 0/O/1/I). */
    code: { type: String, required: true, unique: true },
    pollTokenHash: { type: String, required: true, unique: true, select: false },
    gameSlug: { type: String, required: true },
    deviceName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "denied", "claimed"],
      default: "pending",
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Expired links are useless; let MongoDB clean them up an hour later.
GameLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });

const GameLink = models.GameLink || model("GameLink", GameLinkSchema);
export default GameLink;
