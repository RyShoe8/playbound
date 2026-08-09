import { Schema, model, models } from "mongoose";

export const NOTIFICATION_TYPES = [
  "friend_request",
  "friend_request_accepted",
  "event_rsvp_confirmed",
  "event_reminder",
  "event_starting",
  "tournament_match_reminder",
  "tournament_advanced",
  "play_invite",
  "play_invite_accepted",
  "play_invite_declined",
  "friend_started_playing",
  "friend_looking_for_players",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000, default: null },
    href: { type: String, maxlength: 500, default: "/friends" },
    readAt: { type: Date, default: null },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });

const Notification = models.Notification || model("Notification", NotificationSchema);
export default Notification;
