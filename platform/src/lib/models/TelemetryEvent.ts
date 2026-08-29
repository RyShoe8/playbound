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
  isBot?: boolean;
  createdAt: Date;
}

const TelemetryEventSchema = new Schema(
  {
    event: { type: String, required: true, index: true },
    properties: { type: Schema.Types.Mixed, default: {} },
    userId: { type: String, default: null, index: true },
    anonymousId: { type: String, default: null, index: true },
    sessionId: { type: String, default: null, index: true },
    url: { type: String, default: null },
    referrer: { type: String, default: null },
    ip: { type: String, default: null },
    country: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    device: { type: String, default: null },
    isBot: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TelemetryEventSchema.index({ createdAt: -1 });
TelemetryEventSchema.index({ isBot: 1, createdAt: -1 });
TelemetryEventSchema.index({ event: 1, createdAt: -1 });
TelemetryEventSchema.index({ event: 1, sessionId: 1, createdAt: -1 });
TelemetryEventSchema.index({ userId: 1, createdAt: -1 });

/*
 * Scoped lookups in lib/liveActivity.ts — installs, players this month, active
 * players — all filter on event + one properties.*Slug + a createdAt range.
 * With only {event, createdAt} to work from, every one of those read the whole
 * run of documents for that event type and discarded the ones for other games,
 * which is why a cold game page cost 2–5s while a warm one (15-minute
 * unstable_cache) cost ~0.4s. A crawler only ever sees the cold number.
 *
 * Field order follows equality → sort/range: the slug pins a single game, then
 * createdAt satisfies both the range filter and the ordering without a
 * separate sort stage.
 */
TelemetryEventSchema.index({ event: 1, "properties.gameSlug": 1, createdAt: -1 });
TelemetryEventSchema.index({ event: 1, "properties.modSlug": 1, createdAt: -1 });
TelemetryEventSchema.index({ event: 1, "properties.editionSlug": 1, createdAt: -1 });

const TelemetryEvent =
  models.TelemetryEvent || model("TelemetryEvent", TelemetryEventSchema);
export default TelemetryEvent;
