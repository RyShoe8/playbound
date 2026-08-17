import mongoose, { Schema, Document, Model } from "mongoose";

export type MirrorEventType =
  | "budget_changed"
  | "manual_promote"
  | "manual_evict"
  | "archive_to_vps"
  | "artifact_deleted"
  | "protect"
  | "unprotect"
  | "r2_disabled"
  | "r2_enabled"
  | "mirror_disabled"
  | "mirror_enabled"
  | "alert_triggered"
  | "rebalance_completed";

export interface IMirrorEvent extends Document {
  eventType: MirrorEventType;
  actor: string;
  artifactId?: string | null;
  details: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const MirrorEventSchema = new Schema<IMirrorEvent>(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        "budget_changed",
        "manual_promote",
        "manual_evict",
        "archive_to_vps",
        "artifact_deleted",
        "protect",
        "unprotect",
        "r2_disabled",
        "r2_enabled",
        "mirror_disabled",
        "mirror_enabled",
        "alert_triggered",
        "rebalance_completed",
      ],
      index: true,
    },
    actor: { type: String, required: true },
    artifactId: { type: String, default: null, index: true },
    details: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MirrorEventSchema.index({ createdAt: -1 });

const MirrorEvent: Model<IMirrorEvent> =
  mongoose.models.MirrorEvent || mongoose.model<IMirrorEvent>("MirrorEvent", MirrorEventSchema);

export default MirrorEvent;
