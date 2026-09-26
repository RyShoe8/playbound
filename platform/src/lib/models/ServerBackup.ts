import { Schema, model, models } from "mongoose";

/**
 * A restore point for a customer (PlayBound Dedicated) server: everything
 * PlayBound holds about how the server is set up — name, visibility, size,
 * game settings, map rotation, bans and who has a role. Game world data is not
 * part of it; none of the launch games keeps a persistent world yet.
 *
 * `hash` identifies the configuration so the daily automatic backup is skipped
 * when nothing changed since the last one.
 */
const ServerBackupSchema = new Schema(
  {
    serverId: { type: Schema.Types.ObjectId, ref: "CommunityServer", required: true, index: true },
    kind: { type: String, enum: ["manual", "automatic", "before-restore"], required: true },
    label: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    hash: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ServerBackupSchema.index({ serverId: 1, createdAt: -1 });

export default models.ServerBackup || model("ServerBackup", ServerBackupSchema);
