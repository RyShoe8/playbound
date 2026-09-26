import { Schema, model, models } from "mongoose";

/**
 * The audit trail for a customer (PlayBound Dedicated) server: who started it,
 * changed a setting, kicked a player, ran a console command. Shown on the
 * server's Activity tab and to admin. Kept for 180 days.
 */
const ServerActivitySchema = new Schema(
  {
    serverId: { type: Schema.Types.ObjectId, ref: "CommunityServer", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: null },
    /** "system" entries are PlayBound's own (recovery, admin stop). */
    actorKind: { type: String, enum: ["user", "admin", "system"], default: "user" },
    action: { type: String, required: true },
    detail: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ServerActivitySchema.index({ serverId: 1, createdAt: -1 });
ServerActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export default models.ServerActivity || model("ServerActivity", ServerActivitySchema);
