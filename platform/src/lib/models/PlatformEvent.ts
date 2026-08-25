import { Schema, model, models, type InferSchemaType, type Types } from "mongoose";
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  HOST_TYPES,
} from "@/lib/events/types";

const PlatformEventSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 150 },
    description: { type: String, default: "", maxlength: 4000 },
    eventType: {
      type: String,
      default: "game_night",
      index: true,
      // Allow future types beyond the initial enum without migration pain.
      validate: {
        validator: (v: string) => typeof v === "string" && v.length > 0 && v.length <= 40,
        message: "Invalid eventType",
      },
    },
    gameSlug: { type: String, default: null, index: true },
    coverImage: { type: String, default: null, maxlength: 1000 },
    editionSlug: { type: String, default: null },
    modSlugs: { type: [String], default: [] },
    recommendedModSlugs: { type: [String], default: [] },
    organizerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** @deprecated Prefer organizerId; kept for backward compatibility with creates. */
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: false, default: null },
    hostType: {
      type: String,
      enum: HOST_TYPES,
      default: "playbound",
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    timezone: { type: String, default: "America/New_York", maxlength: 80 },
    registrationDeadline: { type: Date, default: null },
    maxParticipants: { type: Number, default: null, min: 1 },
    status: {
      type: String,
      enum: EVENT_STATUSES,
      default: "registration_open",
      index: true,
    },
    visibility: {
      type: String,
      enum: EVENT_VISIBILITIES,
      default: "public",
    },
    featured: { type: Boolean, default: false, index: true },
    discordInviteUrl: { type: String, default: null, maxlength: 500 },
    discordVoiceChannelId: { type: String, default: null },
    discordTextChannelId: { type: String, default: null },
    discordCategoryId: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    /** Reminder / automation bookkeeping */
    remindersSent: {
      type: {
        h24: { type: Boolean, default: false },
        h1: { type: Boolean, default: false },
        start: { type: Boolean, default: false },
      },
      default: () => ({ h24: false, h1: false, start: false }),
    },
    discordVoiceProvisionedAt: { type: Date, default: null },
    discordVoiceCleanedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Legacy creates used createdAt without timestamps option — keep startsAt index.
PlatformEventSchema.index({ startsAt: 1 });
PlatformEventSchema.index({ status: 1, startsAt: 1 });
PlatformEventSchema.index({ gameSlug: 1, startsAt: 1 });
PlatformEventSchema.index({ featured: 1, startsAt: 1 });
PlatformEventSchema.index({ eventType: 1, startsAt: 1 });

export type PlatformEventDoc = InferSchemaType<typeof PlatformEventSchema> & {
  _id: Types.ObjectId;
};

const PlatformEvent =
  models.PlatformEvent || model("PlatformEvent", PlatformEventSchema);
export default PlatformEvent;

// Re-export for callers that imported EVENT_TYPES from the model path by mistake.
export { EVENT_TYPES, EVENT_STATUSES };
