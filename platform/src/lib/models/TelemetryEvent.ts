import { Schema, model, models, type Types } from "mongoose";

export interface TelemetryEventDoc {
  _id: Types.ObjectId;
  event: string;
  properties: Record<string, unknown>;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  url?: string | null;
  referrer?: string | null;
  ip?: string | null;
  country?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  createdAt: Date;
}

const TelemetryEventSchema = new Schema(
  {
    event: { type: String, required: true, index: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    userId: { type: String, default: null, index: true },
    anonymousId: { type: String, default: null },
    sessionId: { type: String, default: null, index: true },
    url: { type: String, default: null },
    referrer: { type: String, default: null },
    ip: { type: String, default: null },
    country: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    device: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TelemetryEventSchema.index({ createdAt: -1 });
TelemetryEventSchema.index({ event: 1, createdAt: -1 });

const TelemetryEvent =
  models.TelemetryEvent || model("TelemetryEvent", TelemetryEventSchema);
export default TelemetryEvent;
