import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Connect / Couch runtime flags for Admin.
 * Singleton keyed by `singletonKey` (same shape as PlatformLimits).
 */
export interface IConnectSettings extends Document {
  singletonKey: string;
  /** When true, hosts may POST streaming metrics and Admin can list live sessions. */
  streamingMetricsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConnectSettingsSchema = new Schema<IConnectSettings>(
  {
    singletonKey: { type: String, required: true, unique: true, default: "default" },
    streamingMetricsEnabled: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

const ConnectSettings: Model<IConnectSettings> =
  mongoose.models.ConnectSettings ||
  mongoose.model<IConnectSettings>("ConnectSettings", ConnectSettingsSchema);

export default ConnectSettings;
