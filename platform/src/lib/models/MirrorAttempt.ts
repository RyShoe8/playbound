import mongoose, { Schema, Document, Model } from "mongoose";

export type MirrorAttemptResult =
  | "success"
  | "timeout"
  | "connection_error"
  | "http_error"
  | "not_found"
  | "checksum_failure"
  | "cancelled"
  | "stalled";

export interface IMirrorAttempt extends Document {
  artifactId: string;
  sourceId: string;
  sourceType: "public" | "r2" | "playbound_vps";
  attemptedAt: Date;
  completedAt?: Date | null;
  result: MirrorAttemptResult;
  httpStatus?: number | null;
  failureType?: string | null;
  bytesDownloaded: number;
  downloadDuration: number; // ms
  downloadSpeed: number; // bytes/sec
  checksumValid?: boolean | null;
  createdAt: Date;
}

const MirrorAttemptSchema = new Schema<IMirrorAttempt>(
  {
    artifactId: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    sourceType: {
      type: String,
      required: true,
      enum: ["public", "r2", "playbound_vps"],
      index: true,
    },
    attemptedAt: { type: Date, required: true, default: Date.now, index: true },
    completedAt: { type: Date, default: null },
    result: {
      type: String,
      required: true,
      enum: [
        "success",
        "timeout",
        "connection_error",
        "http_error",
        "not_found",
        "checksum_failure",
        "cancelled",
        "stalled",
      ],
      index: true,
    },
    httpStatus: { type: Number, default: null },
    failureType: { type: String, default: null },
    bytesDownloaded: { type: Number, default: 0 },
    downloadDuration: { type: Number, default: 0 },
    downloadSpeed: { type: Number, default: 0 },
    checksumValid: { type: Boolean, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MirrorAttemptSchema.index({ artifactId: 1, attemptedAt: -1 });
MirrorAttemptSchema.index({ sourceId: 1, attemptedAt: -1 });

const MirrorAttempt: Model<IMirrorAttempt> =
  mongoose.models.MirrorAttempt ||
  mongoose.model<IMirrorAttempt>("MirrorAttempt", MirrorAttemptSchema);

export default MirrorAttempt;
