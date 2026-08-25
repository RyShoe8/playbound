import { Schema, model, models, type Document } from "mongoose";

export interface AutonomousGameConfig {
  slug: string;
  enabled: boolean;
  durationHours: number;
  weight: number;
}

export interface AutonomousActiveSession {
  roomId?: string | null;
  gameSlug?: string | null;
  gameTitle?: string | null;
  partyId?: string | null;
  host?: string | null;
  port?: number | null;
  eventId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status: "idle" | "scheduled" | "live";
}

export interface AutonomousMatchConfigDoc extends Document {
  key: string;
  enabled: boolean;
  frequencyHours: number;
  leadTimeMinutes: number;
  defaultDurationHours: number;
  games: AutonomousGameConfig[];
  discord: {
    webhookUrl?: string | null;
    customTitle?: string | null;
    customMessage?: string | null;
  };
  activeSession?: AutonomousActiveSession | null;
  lastTriggeredAt?: Date | null;
  updatedAt: Date;
}

const AutonomousGameConfigSchema = new Schema(
  {
    slug: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    durationHours: { type: Number, default: 2, min: 0.5, max: 24 },
    weight: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const AutonomousMatchConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    enabled: { type: Boolean, default: false, index: true },
    frequencyHours: { type: Number, default: 12, min: 1, max: 168 },
    leadTimeMinutes: { type: Number, default: 0, min: 0, max: 1440 },
    defaultDurationHours: { type: Number, default: 2, min: 0.5, max: 24 },
    games: { type: [AutonomousGameConfigSchema], default: [] },
    discord: {
      webhookUrl: { type: String, default: null },
      customTitle: { type: String, default: "⚡ Pop-Up Match Live" },
      customMessage: { type: String, default: "" },
    },
    activeSession: {
      roomId: { type: String, default: null },
      gameSlug: { type: String, default: null },
      gameTitle: { type: String, default: null },
      partyId: { type: String, default: null },
      host: { type: String, default: null },
      port: { type: Number, default: null },
      eventId: { type: Schema.Types.ObjectId, ref: "PlatformEvent", default: null },
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
      status: {
        type: String,
        enum: ["idle", "scheduled", "live"],
        default: "idle",
      },
    },
    lastTriggeredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default models.AutonomousMatchConfig ||
  model<AutonomousMatchConfigDoc>("AutonomousMatchConfig", AutonomousMatchConfigSchema);
