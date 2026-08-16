/**
 * Play Together (Friends Phase 3) — shared vocabulary.
 * Discord remains the chat layer; these types never model messaging.
 */

export const PLAY_INVITE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
] as const;
export type PlayInviteStatus = (typeof PLAY_INVITE_STATUSES)[number];

/** How PlayBound can help the viewer join a friend's current activity. */
export const JOIN_CAPABILITIES = [
  "supported",
  "unsupported",
  "requiresManualJoin",
] as const;
export type JoinCapability = (typeof JOIN_CAPABILITIES)[number];

export type JoinCapabilityResult = {
  capability: JoinCapability;
  /** Primary CTA label for UI. */
  label: string;
  /** In-app path (never a chat URL). */
  href: string | null;
  reason?: string;
};

/** Looking-for-players window (spec example). */
export const LFG_TTL_MS = 60 * 60 * 1000;

/** Play invites expire if unanswered. */
export const PLAY_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** Anti-spam: one "friend started playing" notice per friend+game per this window. */
export const FRIEND_PLAYING_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 4 — Parties
 * A party is a PlayBound coordination object, not a chat room.
 * Discord handles conversation; PlayBound handles who is playing together,
 * what they're playing, configuration, readiness, and launching.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PARTY_STATUSES = [
  "forming",
  "ready",
  "launching",
  "playing",
  "ended",
] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const PARTY_VISIBILITIES = [
  "public",
  "friends",
  "password",
  "invite_only",
  "event",
] as const;
export type PartyVisibility = (typeof PARTY_VISIBILITIES)[number];

export const PARTY_MEMBER_ROLES = ["leader", "member"] as const;
export type PartyMemberRole = (typeof PARTY_MEMBER_ROLES)[number];

/** Default cap per party — overridable at creation. */
export const PARTY_MAX_SIZE = 8;

/** Auto-end parties with no heartbeat/activity older than this. */
export const PARTY_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Serialised party member for API responses. */
export type PartyMemberPayload = {
  userId: string;
  username: string;
  role: PartyMemberRole;
  ready: boolean;
  joinedAt: string;
};

/** Serialised party for API responses. */
export type PartyPayload = {
  id: string;
  leaderId: string;
  leaderUsername: string;
  members: PartyMemberPayload[];
  gameSlug: string;
  gameTitle: string | null;
  editionSlug: string | null;
  modSlugs: string[];
  status: PartyStatus;
  visibility: PartyVisibility;
  maxSize: number;
  eventId: string | null;
  /** True when a password is required; the hash is never returned. */
  hasPassword: boolean;
  /** Host opted into a Discord voice channel. */
  voiceEnabled: boolean;
  discord: {
    voiceChannelId: string | null;
    inviteUrl: string | null;
  };
  /** Public VPS room for games that cannot host from a home PC. */
  hosted: {
    enabled: boolean;
    status: "none" | "pending" | "ready" | "failed";
    host: string | null;
    port: number | null;
    name: string | null;
    error: string | null;
  };
  lastActivity: string;
  createdAt: string;
};
