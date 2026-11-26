import { Schema, model, models, type Model } from "mongoose";
import type { AdtractionTransaction } from "@/lib/commerce/adtraction/client";

export type AffiliateTransactionDoc = AdtractionTransaction & { fetchedAt: Date; activeInReport: boolean };
const schema = new Schema<AffiliateTransactionDoc>({
  // Provider transaction identity deduplicates retries even before index maintenance runs.
  _id: String,
  channelId: { type: String, required: true },
  programId: { type: String, default: null },
  programName: { type: String, default: null },
  gameSlug: { type: String, default: null },
  transactionDate: { type: Date, required: true },
  sourceUpdatedAt: { type: Date, default: null },
  transactionType: { type: Number, required: true },
  status: { type: Number, enum: [1, 2, 4, 5], required: true },
  paymentStatus: { type: Number, default: null },
  commission: { type: Number, required: true },
  orderValue: { type: Number, default: null },
  currency: { type: String, required: true },
  fetchedAt: { type: Date, required: true },
  activeInReport: { type: Boolean, default: true },
});
schema.index({ channelId: 1, transactionType: 1, gameSlug: 1, status: 1 });
schema.index({ channelId: 1, transactionDate: 1 });
export default (models.AffiliateTransaction as Model<AffiliateTransactionDoc>) || model<AffiliateTransactionDoc>("AffiliateTransaction", schema);
