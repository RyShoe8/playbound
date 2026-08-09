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
