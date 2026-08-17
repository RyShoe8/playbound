import mongoose, { Schema, Document, Model } from "mongoose";

export type MirrorJobType =
  | "promote_to_r2"
  | "evict_from_r2"
  | "verify_vps"
  | "verify_r2"
  | "rebalance_cache";

export type MirrorJobStatus = "pending" | "running" | "completed" | "failed";

export interface IMirrorJob extends Document {
  jobType: MirrorJobType;
  artifactId?: string | null;
  status: MirrorJobStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MirrorJobSchema = new Schema<IMirrorJob>(
  {
    jobType: {
      type: String,
      required: true,
      enum: ["promote_to_r2", "evict_from_r2", "verify_vps", "verify_r2", "rebalance_cache"],
      index: true,
    },
    artifactId: { type: String, default: null, index: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

MirrorJobSchema.index({ status: 1, createdAt: 1 });

const MirrorJob: Model<IMirrorJob> =
  mongoose.models.MirrorJob || mongoose.model<IMirrorJob>("MirrorJob", MirrorJobSchema);

export default MirrorJob;
