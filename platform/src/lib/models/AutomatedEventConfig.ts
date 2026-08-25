import { Schema, model, models, type Document } from "mongoose";

export interface AutomatedEventGameConfig {
  slug: string;
  editionSlug?: string | null;
  editionName?: string | null;
  enabled: boolean;
  durationHours: number;
  weight: number;
}

export interface AutomatedEventActiveSession {
  roomId?: string | null;
  gameSlug?: string | null;
  editionSlug?: string | null;
  gameTitle?: string | null;
  partyId?: string | null;
  host?: string | null;
  port?: number | null;
  eventId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status: "idle" | "scheduled" | "live";
}

export interface AutomatedEventConfigDoc extends Document {
  key: string;
  enabled: boolean;
  frequencyHours: number;
  leadTimeMinutes: number;
  defaultDurationHours: number;
  games: AutomatedEventGameConfig[];
  discord: {
    webhookUrl?: string | null;
    customTitle?: string | null;
    customMessage?: string | null;
  };
  activeSession?: AutomatedEventActiveSession | null;
  lastTriggeredAt?: Date | null;
  updatedAt: Date;
}

// Backwards compatibility type aliases
export type AutonomousGameConfig = AutomatedEventGameConfig;
export type AutonomousActiveSession = AutomatedEventActiveSession;
export type AutonomousMatchConfigDoc = AutomatedEventConfigDoc;

const AutomatedEventGameConfigSchema = new Schema(
  {
    slug: { type: String, required: true },
    editionSlug: { type: String, default: null },
    editionName: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    durationHours: { type: Number, default: 2, min: 0.5, max: 24 },
    weight: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const AutomatedEventConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    enabled: { type: Boolean, default: false, index: true },
    frequencyHours: { type: Number, default: 12, min: 1, max: 168 },
    leadTimeMinutes: { type: Number, default: 0, min: 0, max: 1440 },
    defaultDurationHours: { type: Number, default: 2, min: 0.5, max: 24 },
    games: { type: [AutomatedEventGameConfigSchema], default: [] },
    discord: {
      webhookUrl: { type: String, default: null },
      customTitle: { type: String, default: "⚡ Pop-Up Event Live" },
      customMessage: { type: String, default: "" },
    },
    activeSession: {
      roomId: { type: String, default: null },
      gameSlug: { type: String, default: null },
      editionSlug: { type: String, default: null },
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
  { timestamps: true, collection: "autonomous_match_configs" }
);

export default models.AutomatedEventConfig ||
  models.AutonomousMatchConfig ||
  model<AutomatedEventConfigDoc>("AutomatedEventConfig", AutomatedEventConfigSchema);
