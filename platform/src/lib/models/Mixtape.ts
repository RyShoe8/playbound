import { Schema, model, models } from "mongoose";

const track = new Schema({
  tapeId: { type: String, required: true, unique: true },
  title: { type: String, default: "" }, artist: { type: String, default: "" },
  album: { type: String, default: "" }, year: { type: Number, default: null },
  genre: { type: String, default: "" }, bio: { type: String, default: "" },
  audioUrl: { type: String, default: "" }, coverUrl: { type: String, default: "" },
  website: { type: String, default: "" }, bandcamp: { type: String, default: "" },
  spotify: { type: String, default: "" }, discountCode: { type: String, default: "" },
  discountPercent: { type: Number, default: null },
  starter: { type: Boolean, default: false }, enabled: { type: Boolean, default: true },
}, { timestamps: true });
const profile = new Schema({
  userId: { type: String, required: true, unique: true },
  inventory: { type: [String], default: [] }, deck: { type: [String], default: [] },
  acquisitions: { type: [Schema.Types.Mixed], default: [] },
  resetHistory: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });
const settings = new Schema({
  key: { type: String, required: true, unique: true }, menuTapeId: { type: String, default: "" },
});
const match = new Schema({
  matchId: { type: String, required: true, unique: true }, sessionId: { type: String, required: true },
  host: { type: String, default: "" }, client: { type: String, default: "" },
  decks: { type: Schema.Types.Mixed, default: {} }, reports: { type: Schema.Types.Mixed, default: {} },
  dubTrack: { type: String, default: "" }, expiresAt: { type: Date, required: true },
}, { timestamps: true });
match.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const MixtapeTrack = models.MixtapeTrack || model("MixtapeTrack", track);
export const MixtapeProfile = models.MixtapeProfile || model("MixtapeProfile", profile);
export const MixtapeSettings = models.MixtapeSettings || model("MixtapeSettings", settings);
export const MixtapeMatch = models.MixtapeMatch || model("MixtapeMatch", match);
