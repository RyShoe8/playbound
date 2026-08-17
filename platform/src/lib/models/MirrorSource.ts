import mongoose, { Schema, Document, Model } from "mongoose";

export type SourceType = "public" | "r2" | "playbound_vps";
export type SourceHealthStatus = "unknown" | "healthy" | "degraded" | "failing" | "offline";

export interface IMirrorSource extends Document {
  sourceId: string;
  artifactId: string;
  sourceType: SourceType;
  url: string;
  enabled: boolean;
  priority: number;
  healthStatus: SourceHealthStatus;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  checksumFailureCount: number;
  averageResponseTime: number; // ms
  averageDownloadSpeed: number; // bytes/sec
  lastSuccess?: Date | null;
  lastFailure?: Date | null;
  lastChecked?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MirrorSourceSchema = new Schema<IMirrorSource>(
  {
    sourceId: { type: String, required: true, unique: true, index: true },
    artifactId: { type: String, required: true, index: true },
    sourceType: {
      type: String,
      required: true,
      enum: ["public", "r2", "playbound_vps"],
      default: "public",
      index: true,
    },
    url: { type: String, required: true },
    enabled: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 100, index: true },
    healthStatus: {
      type: String,
      enum: ["unknown", "healthy", "degraded", "failing", "offline"],
      default: "healthy",
      index: true,
    },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    timeoutCount: { type: Number, default: 0 },
    checksumFailureCount: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    averageDownloadSpeed: { type: Number, default: 0 },
    lastSuccess: { type: Date, default: null },
    lastFailure: { type: Date, default: null },
    lastChecked: { type: Date, default: null },
  },
  { timestamps: true }
);

MirrorSourceSchema.index({ artifactId: 1, sourceType: 1, enabled: 1 });

const MirrorSource: Model<IMirrorSource> =
  mongoose.models.MirrorSource || mongoose.model<IMirrorSource>("MirrorSource", MirrorSourceSchema);

export default MirrorSource;
