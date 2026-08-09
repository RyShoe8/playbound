import { Schema, model, models, type InferSchemaType, type Types } from "mongoose";
import { RSVP_STATUSES } from "@/lib/events/types";

const EventRsvpSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformEvent",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RSVP_STATUSES,
      required: true,
    },
    checkedInAt: { type: Date, default: null },
    attendedAt: { type: Date, default: null },
    playedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

EventRsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });
EventRsvpSchema.index({ eventId: 1, status: 1 });
EventRsvpSchema.index({ userId: 1, status: 1 });

export type EventRsvpDoc = InferSchemaType<typeof EventRsvpSchema> & {
  _id: Types.ObjectId;
};

const EventRsvp = models.EventRsvp || model("EventRsvp", EventRsvpSchema);
export default EventRsvp;
