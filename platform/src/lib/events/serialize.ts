import type { Types } from "mongoose";
import { defaultEndsAt, formatEventWhen } from "@/lib/events/time";
import { deriveEventStatus, type EventStatus, type EventType } from "@/lib/events/types";
import type { RsvpCounts } from "@/lib/events/rsvpCounts";

export type SerializedEvent = {
  id: string;
  title: string;
  description: string;
  eventType: EventType;
  gameSlug: string | null;
  editionSlug: string | null;
  modSlugs: string[];
  recommendedModSlugs: string[];
  organizerId: string | null;
  hostType: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  registrationDeadline: string | null;
  maxParticipants: number | null;
  status: EventStatus;
  visibility: string;
  featured: boolean;
  discordInviteUrl: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  when: { dateLine: string; timeLine: string; rangeLine: string };
  counts?: RsvpCounts;
};

type EventLike = {
  _id: Types.ObjectId | string;
  title: string;
  description: string;
  eventType?: string | null;
  gameSlug?: string | null;
  editionSlug?: string | null;
  modSlugs?: string[] | null;
  recommendedModSlugs?: string[] | null;
  organizerId?: Types.ObjectId | string | null;
  createdBy?: Types.ObjectId | string | null;
  hostType?: string | null;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  timezone?: string | null;
  registrationDeadline?: Date | string | null;
  maxParticipants?: number | null;
  status?: string | null;
  visibility?: string | null;
  featured?: boolean | null;
  discordInviteUrl?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function serializeEvent(
  e: EventLike,
  counts?: RsvpCounts
): SerializedEvent {
  const startsAt = new Date(e.startsAt);
  const endsAt = e.endsAt ? new Date(e.endsAt) : defaultEndsAt(startsAt);
  const rawStatus = (e.status || "registration_open") as EventStatus;
  const status = deriveEventStatus({
    status: rawStatus,
    startsAt,
    endsAt,
    registrationDeadline: e.registrationDeadline
      ? new Date(e.registrationDeadline)
      : null,
  });
  const timezone = e.timezone || "America/New_York";
  const when = formatEventWhen(startsAt, { timezone, endsAt });

  return {
    id: String(e._id),
    title: e.title,
    description: e.description,
    eventType: (e.eventType || "game_night") as EventType,
    gameSlug: e.gameSlug || null,
    editionSlug: e.editionSlug || null,
    modSlugs: e.modSlugs || [],
    recommendedModSlugs: e.recommendedModSlugs || [],
    organizerId: e.organizerId
      ? String(e.organizerId)
      : e.createdBy
        ? String(e.createdBy)
        : null,
    hostType: e.hostType || "playbound",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone,
    registrationDeadline: e.registrationDeadline
      ? new Date(e.registrationDeadline).toISOString()
      : null,
    maxParticipants: e.maxParticipants ?? null,
    status,
    visibility: e.visibility || "public",
    featured: Boolean(e.featured),
    discordInviteUrl: e.discordInviteUrl || null,
    publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : null,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
    when,
    ...(counts ? { counts } : {}),
  };
}
