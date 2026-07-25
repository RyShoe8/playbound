import { Schema, model, models, Types } from "mongoose";

const LibraryEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  gameSlug: { type: String, required: true, index: true },
  saved: { type: Boolean, default: false },
  installed: { type: Boolean, default: false },
  version: { type: String },
  installedAt: { type: Date },
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

LibraryEntrySchema.index({ userId: 1, gameSlug: 1 }, { unique: true });

export type LibraryEntryDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  gameSlug: string;
  saved: boolean;
  installed: boolean;
  version?: string;
  installedAt?: Date;
  addedAt: Date;
  updatedAt: Date;
};

const LibraryEntry = models.LibraryEntry || model("LibraryEntry", LibraryEntrySchema);
export default LibraryEntry;
