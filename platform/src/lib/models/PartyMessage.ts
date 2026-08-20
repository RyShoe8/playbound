import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPartyMessage extends Document {
  partyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId | null;
  username: string;
  avatarUrl: string | null;
  content: string;
  source: "playbound" | "discord";
  bot: boolean;
  discordMessageId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PartyMessageSchema = new Schema<IPartyMessage>(
  {
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    username: { type: String, required: true, maxlength: 60 },
    avatarUrl: { type: String, default: null },
    content: { type: String, required: true, maxlength: 500 },
    source: { type: String, enum: ["playbound", "discord"], default: "playbound" },
    bot: { type: Boolean, default: false },
    discordMessageId: { type: String, default: null, sparse: true },
  },
  { timestamps: true }
);

PartyMessageSchema.index({ partyId: 1, createdAt: 1 });

const PartyMessage: Model<IPartyMessage> =
  mongoose.models.PartyMessage || mongoose.model<IPartyMessage>("PartyMessage", PartyMessageSchema);

export default PartyMessage;
