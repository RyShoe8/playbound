import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A persistent game world that outlives the party that played it.
 *
 * Parties end every session, so the dedicated server's save folder is keyed
 * by this id instead (the agent's `saveKey`). Anyone who has been in a party
 * on the world is a member and can load it again from the party menu.
 */
const SavedWorldSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: "User", default: [], index: true },
    lastPlayedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SavedWorldSchema.index({ memberIds: 1, gameSlug: 1, lastPlayedAt: -1 });

export type SavedWorldDoc = InferSchemaType<typeof SavedWorldSchema>;

const SavedWorld: Model<SavedWorldDoc> =
  (mongoose.models.SavedWorld as Model<SavedWorldDoc>) ||
  mongoose.model<SavedWorldDoc>("SavedWorld", SavedWorldSchema);

export default SavedWorld;
