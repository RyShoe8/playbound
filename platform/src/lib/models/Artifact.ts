import mongoose, { Schema, Document, Model } from "mongoose";

export type ArtifactType =
  | "game"
  | "game_patch"
  | "mod"
  | "modpack"
  | "runtime"
  | "dependency"
  | "launcher"
  | "installer"
  | "configuration";

export type VpsStatus = "missing" | "uploading" | "verified" | "corrupted" | "offline";

export type R2Status =
  | "not_cached"
  | "candidate"
  | "queued"
  | "uploading"
  | "verifying"
  | "cached"
  | "eviction_candidate"
  | "evicting";

export interface IArtifact extends Document {
  artifactId: string; // e.g. "holocure-0.7.1"
  gameSlug?: string | null;
  version: string;
  artifactType: ArtifactType;
  filename: string;
  relativePath: string; // e.g. "games/holocure/0.7.1/holocure-playbound.zip"
  sizeBytes: number;
  sha256: string;
  licenseStatus: string;
  mirrorEnabled: boolean;
  redistributionAllowed: boolean;
  vpsStatus: VpsStatus;
  r2Status: R2Status;
  r2PromotionScore: number;
  r2LastPromoted?: Date | null;
  r2LastEvicted?: Date | null;
  r2Protected: boolean;
  r2Disabled: boolean;
  totalDownloads: number;
  recentDownloads: number;
  averageDownloadSpeed: number; // bytes / sec
  lastPublicSuccess?: Date | null;
  lastPublicFailure?: Date | null;
  publicSuccessCount: number;
  publicFailureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ArtifactSchema = new Schema<IArtifact>(
  {
    artifactId: { type: String, required: true, unique: true, index: true },
    gameSlug: { type: String, default: null, index: true },
    version: { type: String, required: true },
    artifactType: {
      type: String,
      required: true,
      enum: [
        "game",
        "game_patch",
        "mod",
        "modpack",
        "runtime",
        "dependency",
        "launcher",
        "installer",
        "configuration",
      ],
      default: "game",
      index: true,
    },
    filename: { type: String, required: true },
    relativePath: { type: String, required: true },
    sizeBytes: { type: Number, required: true, default: 0 },
    sha256: { type: String, required: true, index: true },
    licenseStatus: { type: String, default: "redistributable" },
    mirrorEnabled: { type: Boolean, default: true, index: true },
    redistributionAllowed: { type: Boolean, default: true },
    vpsStatus: {
      type: String,
      enum: ["missing", "uploading", "verified", "corrupted", "offline"],
      default: "verified",
      index: true,
    },
    r2Status: {
      type: String,
      enum: [
        "not_cached",
        "candidate",
        "queued",
        "uploading",
        "verifying",
        "cached",
        "eviction_candidate",
        "evicting",
      ],
      default: "not_cached",
      index: true,
    },
    r2PromotionScore: { type: Number, default: 0, index: true },
    r2LastPromoted: { type: Date, default: null },
    r2LastEvicted: { type: Date, default: null },
    r2Protected: { type: Boolean, default: false },
    r2Disabled: { type: Boolean, default: false },
    totalDownloads: { type: Number, default: 0 },
    recentDownloads: { type: Number, default: 0 },
    averageDownloadSpeed: { type: Number, default: 0 },
    lastPublicSuccess: { type: Date, default: null },
    lastPublicFailure: { type: Date, default: null },
    publicSuccessCount: { type: Number, default: 0 },
    publicFailureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ArtifactSchema.index({ r2Status: 1, r2PromotionScore: -1 });

const Artifact: Model<IArtifact> =
  mongoose.models.Artifact || mongoose.model<IArtifact>("Artifact", ArtifactSchema);

export default Artifact;
