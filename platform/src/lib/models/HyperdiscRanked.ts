import { Schema, model, models } from "mongoose";

/** A player's HyperDisc Arena rating, moved by confirmed online match results. */
const rating = new Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, default: "Player" },
  rating: { type: Number, default: 1000 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
}, { timestamps: true });
rating.index({ rating: -1 });

/**
 * A player waiting for a quick match. The first player in waits in a private room (joinCode); the
 * next compatible player claims the ticket and joins that room.
 */
const ticket = new Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, default: "Player" },
  rating: { type: Number, default: 1000 },
  version: { type: String, required: true },
  joinCode: { type: String, default: "" },
  status: { type: String, enum: ["waiting", "matched"], default: "waiting" },
  matchedWith: { type: String, default: "" },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
ticket.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ticket.index({ status: 1, version: 1, createdAt: 1 });

export const HyperdiscRating = models.HyperdiscRating || model("HyperdiscRating", rating);
export const HyperdiscQueueTicket = models.HyperdiscQueueTicket || model("HyperdiscQueueTicket", ticket);
