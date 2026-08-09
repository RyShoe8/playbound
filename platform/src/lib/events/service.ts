import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { getGame } from "@/lib/catalog";
import { defaultEndsAt } from "@/lib/events/time";
import {
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  HOST_TYPES,
  PUBLIC_LISTABLE_STATUSES,
  isEventStatus,
} from "@/lib/events/types";
import { getRsvpCountsForEvents } from "@/lib/events/rsvpCounts";
import { serializeEvent } from "@/lib/events/serialize";

export const eventCreateSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(4000),
  eventType: z.string().min(1).max(40).default("game_night"),
  gameSlug: z.string().nullable().optional(),
  editionSlug: z.string().nullable().optional(),
  modSlugs: z.array(z.string()).optional(),
  recommendedModSlugs: z.array(z.string()).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  timezone: z.string().max(80).optional(),
  registrationDeadline: z.string().optional().nullable(),
  maxParticipants: z.number().int().positive().nullable().optional(),
  status: z.string().optional(),
  visibility: z.enum(EVENT_VISIBILITIES).optional(),
  hostType: z.enum(HOST_TYPES).optional(),
  featured: z.boolean().optional(),
  discordInviteUrl: z.string().url().nullable().optional().or(z.literal("")),
  // Tournament extras (optional)
  tournamentFormat: z
    .enum(["single_elim", "double_elim", "round_robin", "ffa"])
    .optional(),
  teamSize: z.number().int().min(1).max(16).optional(),
  checkInRequired: z.boolean().optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial().extend({
  cancel: z.boolean().optional(),
});

export async function validateGameSlug(slug: string | null | undefined) {
  if (!slug) return true;
  return Boolean(await getGame(slug));
}

export async function listPublicEvents(opts?: {
  includePast?: boolean;
  gameSlug?: string | null;
  eventType?: string | null;
  limit?: number;
}) {
  await dbConnect();
  const now = new Date();
  const filter: Record<string, unknown> = {
    visibility: { $ne: "unlisted" },
    status: {
      $in: opts?.includePast
        ? [...PUBLIC_LISTABLE_STATUSES, "cancelled"]
        : PUBLIC_LISTABLE_STATUSES.filter((s) => s !== "completed"),
    },
  };
  if (opts?.gameSlug) filter.gameSlug = opts.gameSlug;
  if (opts?.eventType) filter.eventType = opts.eventType;
  if (!opts?.includePast) {
    // Still-active or upcoming (allow live window slightly after endsAt is missing)
    filter.$or = [
      { endsAt: { $gte: now } },
      { endsAt: null, startsAt: { $gte: new Date(now.getTime() - 6 * 3600_000) } },
      { status: "live" },
    ];
  }

  const events = await PlatformEvent.find(filter)
    .sort({ featured: -1, startsAt: 1 })
    .limit(opts?.limit ?? 50)
    .lean();

  const ids = events.map((e) => e._id as Types.ObjectId);
  const counts = await getRsvpCountsForEvents(ids);
  return events.map((e) => serializeEvent(e, counts.get(String(e._id))));
}

export async function createPlatformEvent(
  body: z.infer<typeof eventCreateSchema>,
  organizerId: string
) {
  if (body.gameSlug && !(await validateGameSlug(body.gameSlug))) {
    throw Object.assign(new Error("Unknown game"), { status: 400 });
  }
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw Object.assign(new Error("Invalid startsAt"), { status: 400 });
  }
  const endsAt = body.endsAt ? new Date(body.endsAt) : defaultEndsAt(startsAt);
  const status =
    body.status && isEventStatus(body.status) ? body.status : "registration_open";

  await dbConnect();
  const doc = await PlatformEvent.create({
    title: body.title,
    description: body.description,
    eventType: body.eventType || EVENT_TYPES[0],
    gameSlug: body.gameSlug || null,
    editionSlug: body.editionSlug || null,
    modSlugs: body.modSlugs || [],
    recommendedModSlugs: body.recommendedModSlugs || [],
    organizerId,
    createdBy: organizerId,
    hostType: body.hostType || "playbound",
    startsAt,
    endsAt,
    timezone: body.timezone || "America/New_York",
    registrationDeadline: body.registrationDeadline
      ? new Date(body.registrationDeadline)
      : null,
    maxParticipants: body.maxParticipants ?? null,
    status,
    visibility: body.visibility || "public",
    featured: Boolean(body.featured),
    discordInviteUrl: body.discordInviteUrl || null,
    publishedAt: status === "draft" ? null : new Date(),
  });

  return doc;
}
