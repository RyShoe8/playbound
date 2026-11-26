import { Schema, model, models, type Model } from "mongoose";

export interface AffiliateSyncStateDoc {
  _id: string;
  owner: string | null;
  leaseUntil: Date;
  nextAttemptAt: Date;
  reportFrom: Date | null;
  cursor: Date | null;
  scanTo: Date | null;
  lastAttemptAt: Date | null;
  lastSyncedAt: Date | null;
  lastFullSyncAt: Date | null;
  coveredThrough: Date | null;
  lastError: string | null;
}
const schema = new Schema<AffiliateSyncStateDoc>({
  _id: String,
  owner: { type: String, default: null },
  leaseUntil: { type: Date, default: new Date(0) },
  nextAttemptAt: { type: Date, default: new Date(0) },
  reportFrom: { type: Date, default: null },
  cursor: { type: Date, default: null },
  scanTo: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
  lastSyncedAt: { type: Date, default: null },
  lastFullSyncAt: { type: Date, default: null },
  coveredThrough: { type: Date, default: null },
  lastError: { type: String, default: null },
});
export default (models.AffiliateSyncState as Model<AffiliateSyncStateDoc>) || model<AffiliateSyncStateDoc>("AffiliateSyncState", schema);
