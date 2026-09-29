import { Schema, model, models } from "mongoose";

/** Recorded only after the event's side effects have succeeded. */
const StripeWebhookReceiptSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  objectId: { type: String, required: true },
  processedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

export default models.StripeWebhookReceipt || model("StripeWebhookReceipt", StripeWebhookReceiptSchema);
