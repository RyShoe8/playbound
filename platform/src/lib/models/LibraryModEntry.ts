import { Schema, model, models, Types } from "mongoose";

const LibraryModEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  modSlug: { type: String, required: true, index: true },
  baseGameSlug: { type: String, required: true, index: true },
  installed: { type: Boolean, default: true },
  version: { type: String },
  installedAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
});

LibraryModEntrySchema.index({ userId: 1, modSlug: 1 }, { unique: true });

export type LibraryModEntryDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  modSlug: string;
  baseGameSlug: string;
  installed: boolean;
  version?: string;
  installedAt?: Date;
  updatedAt: Date;
};

const LibraryModEntry =
  models.LibraryModEntry || model("LibraryModEntry", LibraryModEntrySchema);
export default LibraryModEntry;
