import { Schema, model, models, type Document } from "mongoose";

export interface AutomatedEventGameConfig {
  slug: string;
  editionSlug?: string | null;
  editionName?: string | null;
  enabled: boolean;
  durationHours: number;
  weight: number;
}

export interface NightlyGameConfig {
  slug: string;
  editionSlug?: string | null;
  enabled: boolean;
  weight: number;
  minimumDaysBetweenEvents: number;
}

export interface NightlyScheduleConfig {
  enabled: boolean;
  timezone: string;
  localTime: string;
  durationHours: number;
  horizonDays: number;
  warmupHours: number;
  graceHours: number;
  weeklyNotification: { enabled: boolean; weekday: number; localTime: string };
  games: NightlyGameConfig[];
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
  nightly: NightlyScheduleConfig;
  discord: {
    webhookUrl?: string | null;
    customTitle?: string | null;
    customMessage?: string | null;
  };
  activeSession?: AutomatedEventActiveSession | null;
  lastTriggeredAt?: Date | null;
  updatedAt: Date;
}

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

const NightlyGameConfigSchema = new Schema(
  {
    slug: { type: String, required: true },
    editionSlug: { type: String, default: null },
    enabled: { type: Boolean, default: false },
    weight: { type: Number, default: 1, min: 1, max: 100 },
    minimumDaysBetweenEvents: { type: Number, default: 5, min: 0, max: 365 },
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
    // Independent of the legacy pop-up planner. Existing pop-up games are never
    // automatically enrolled in the nightly schedule.
    nightly: {
      enabled: { type: Boolean, default: false },
      timezone: { type: String, default: "America/Chicago" },
      localTime: { type: String, default: "19:00" },
      durationHours: { type: Number, default: 2, min: 0.5, max: 24 },
      horizonDays: { type: Number, default: 7, min: 1, max: 14 },
      warmupHours: { type: Number, default: 4, min: 1, max: 24 },
      graceHours: { type: Number, default: 1, min: 0, max: 24 },
      weeklyNotification: {
        enabled: { type: Boolean, default: false },
        weekday: { type: Number, default: 1, min: 0, max: 6 },
        localTime: { type: String, default: "10:00" },
      },
      games: { type: [NightlyGameConfigSchema], default: [] },
    },
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
  model<AutomatedEventConfigDoc>("AutomatedEventConfig", AutomatedEventConfigSchema);
