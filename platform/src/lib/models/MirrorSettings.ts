import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMirrorSettings extends Document {
  singletonKey: string;
  r2MonthlyBudgetGB: number;
  r2WarningThreshold: number; // percentage (e.g. 90)
  r2MinFreeBudgetGB: number;
  r2MinRetentionHours: number; // e.g. 24
  autoPromotion: boolean;
  autoEviction: boolean;
  maxR2ArtifactSizeGB: number;
  vpsStorageLimitGB: number;
  vpsMirrorBaseUrl: string;
  lastScanAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MirrorSettingsSchema = new Schema<IMirrorSettings>(
  {
    singletonKey: { type: String, required: true, unique: true, default: "default" },
    r2MonthlyBudgetGB: { type: Number, required: true, default: 8.0 },
    r2WarningThreshold: { type: Number, required: true, default: 90 },
    r2MinFreeBudgetGB: { type: Number, required: true, default: 0.5 },
    r2MinRetentionHours: { type: Number, required: true, default: 24 },
    autoPromotion: { type: Boolean, default: true },
    autoEviction: { type: Boolean, default: true },
    maxR2ArtifactSizeGB: { type: Number, default: 5.0 },
    vpsStorageLimitGB: { type: Number, default: 150.0 },
    vpsMirrorBaseUrl: { type: String, default: "https://mirror.playbound.club" },
    lastScanAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const MirrorSettings: Model<IMirrorSettings> =
  mongoose.models.MirrorSettings ||
  mongoose.model<IMirrorSettings>("MirrorSettings", MirrorSettingsSchema);

export default MirrorSettings;
