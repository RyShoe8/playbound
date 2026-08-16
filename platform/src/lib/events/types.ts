/**
 * PlayBound Events — shared types and status machine.
 * Extend eventType with new string values later without restructuring.
 */

export const EVENT_TYPES = ["game_night", "tournament", "party"] as const;
export type EventType = (typeof EVENT_TYPES)[number] | (string & {});

export function eventTypeLabel(type: string): string {
  if (type === "tournament") return "Tournament";
  if (type === "party") return "Party";
  return "Game Night";
}

export function teamSizeLabel(size: number): string {
  if (size <= 1) return "Solo";
  if (size === 2) return "2v2";
  return `${size}-player teams`;
}

export const EVENT_STATUSES = [
  "draft",
  "published",
  "registration_open",
  "registration_closed",
  "live",
  "completed",
  "cancelled",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VISIBILITIES = ["public", "unlisted"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const HOST_TYPES = ["playbound", "community"] as const;
export type HostType = (typeof HOST_TYPES)[number];

export const RSVP_STATUSES = ["going", "maybe", "not_going"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const TOURNAMENT_FORMATS = [
  "single_elim",
  "double_elim",
  "round_robin",
  "ffa",
] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_PARTICIPANT_STATES = [
  "registered",
  "checked_in",
  "active",
  "eliminated",
  "winner",
] as const;
export type TournamentParticipantState = (typeof TOURNAMENT_PARTICIPANT_STATES)[number];

export const MATCH_STATUSES = [
  "pending",
  "scheduled",
  "live",
  "completed",
  "cancelled",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Statuses where the public can discover / view the event. */
export const PUBLIC_LISTABLE_STATUSES: EventStatus[] = [
  "published",
  "registration_open",
  "registration_closed",
  "live",
  "completed",
];

/** Statuses that accept RSVP mutations. */
export const RSVP_ALLOWED_STATUSES: EventStatus[] = [
  "published",
  "registration_open",
  "registration_closed",
  "live",
];

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && v.length > 0 && v.length <= 40;
}

export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === "string" && (EVENT_STATUSES as readonly string[]).includes(v);
}

export function isRsvpStatus(v: unknown): v is RsvpStatus {
  return typeof v === "string" && (RSVP_STATUSES as readonly string[]).includes(v);
}

/**
 * Derive desired status from wall-clock times.
 * Cancelled / draft are sticky and not auto-advanced.
 */
export function deriveEventStatus(opts: {
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  registrationDeadline?: Date | null;
  now?: Date;
}): EventStatus {
  if (opts.status === "cancelled" || opts.status === "draft") return opts.status;
  const now = opts.now ?? new Date();
  if (now >= opts.endsAt) return "completed";
  if (now >= opts.startsAt) return "live";
  const deadline = opts.registrationDeadline ?? opts.startsAt;
  if (now >= deadline) return "registration_closed";
  if (opts.status === "published" || opts.status === "registration_open") {
    return "registration_open";
  }
  return opts.status;
}

export function canRsvp(status: EventStatus): boolean {
  return RSVP_ALLOWED_STATUSES.includes(status);
}

export function isLiveOrUpcoming(status: EventStatus): boolean {
  return (
    status === "published" ||
    status === "registration_open" ||
    status === "registration_closed" ||
    status === "live"
  );
}
