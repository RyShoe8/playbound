/**
 * Play Together (Friends Phase 3) — shared vocabulary.
 * Discord remains the chat layer; these types never model messaging.
 */

import type { PartyReadiness } from "@/lib/playTogether/partyReadiness";

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

/**
 * The three games bundled in OpenRA's stock client. Distinct from
 * `editionSlug`, which for the "official" edition names the one client that
 * can run any of them — see the comment on Party's `openRaMod` field.
 */
export const OPENRA_MODS = ["ra", "cnc", "d2k"] as const;
export type OpenRaModSlug = (typeof OPENRA_MODS)[number];
export const OPENRA_MOD_LABELS: Record<OpenRaModSlug, string> = {
  ra: "Red Alert",
  cnc: "Tiberian Dawn",
  d2k: "Dune 2000",
};

/** Default cap per party — overridable at creation. */
export const PARTY_MAX_SIZE = 8;

export const PARTY_NAME_MAX = 60;

export const PARTY_VISIBILITY_LABELS: Record<Exclude<PartyVisibility, "event">, string> = {
  public: "Public",
  friends: "Friends only",
  password: "Password",
  invite_only: "Invite only",
};

export function normalizePartyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, PARTY_NAME_MAX);
  return name || null;
}

export function partyDisplayName(party: {
  name?: string | null;
  leaderUsername: string;
}): string {
  return party.name?.trim() || `${party.leaderUsername}'s party`;
}

export type ConfigSyncMember = {
  userId: string;
  username: string;
  hasGame: boolean;
  hasEdition: boolean;
  missingMods: string[];
  /** The host measures itself; nobody is warned about not matching themselves. */
  isHost: boolean;
  /** Which edition this member actually has installed, when they have one. */
  installedEditionSlug: string | null;
  /** Live presence status is `playing` (in a game process right now). */
  playing: boolean;
};

export type ConfigSyncResult = {
  gameSlug: string;
  editionSlug: string | null;
  /** Human label for editionSlug — so install CTAs can name the build. */
  editionName: string | null;
  modSlugs: string[];
  members: ConfigSyncMember[];
  /**
   * Every member has the game, edition and mods.
   *
   * Named for what it measures. `allReady` below is the same value under the
   * old name, kept because shipped launcher builds read it — renaming it on the
   * wire would make them think nobody is in sync.
   */
  allInSync: boolean;
  /** @deprecated Wire-compatibility alias for `allInSync`. Read `allInSync`. */
  allReady: boolean;
  /**
   * Where the reference config came from.
   *
   * "host" means it was read off the party leader's actual library — the case
   * the feature exists for, since what matters is matching the person who
   * picked the game, not a field someone typed. "party" means the leader has
   * nothing installed yet, so the party's declared editionSlug/modSlugs stand
   * in and nobody gets told they are incompatible with an empty install.
   */
  referenceSource: "host" | "party";
  hostUserId: string | null;
  hostUsername: string | null;
};

/**
 * Auto-end parties with no heartbeat/activity older than this.
 *
 * Fifteen minutes, not four hours. The offline-member sweep normally clears a
 * party within about three minutes of everyone disconnecting, so this is the
 * backstop for parties that sweep misses — and at four hours the backstop was
 * long enough that a dead party looked permanent, showing up in friends-playing
 * and party lists long after everyone had gone.
 *
 * Long enough to survive a reconnect: presence goes stale after two minutes, so
 * this leaves considerable room for a launcher restart or a brief drop without
 * ending a party someone is still in.
 */
export const PARTY_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Serialised party member for API responses. */
export type PartyMemberPayload = {
  userId: string;
  username: string;
  role: PartyMemberRole;
  ready: boolean;
  joinedAt: string;
  /**
   * From presence: "windows" | "macos" | "linux" | … | "unknown".
   * Unknown means no live presence row — treated as "do not constrain".
   */
  os: string;
};

/** Serialised party for API responses. */
export type PartyPayload = {
  id: string;
  leaderId: string;
  leaderUsername: string;
  name: string | null;
  members: PartyMemberPayload[];
  gameSlug: string;
  gameTitle: string | null;
  editionSlug: string | null;
  modSlugs: string[];
  /**
   * For `gameSlug === "openra"` only: which of Red Alert / Tiberian Dawn /
   * Dune 2000 the party is playing. Null means unset — joiners resolve to
   * "ra" the same way they always have, so this is purely additive.
   */
  openRaMod: OpenRaModSlug | null;
  status: PartyStatus;
  visibility: PartyVisibility;
  maxSize: number;
  /**
   * Desktop platforms every game offered to this party must support, derived
   * from the members' presence. Empty means no member's OS is known, which
   * clients read as "no constraint" rather than "nothing qualifies".
   */
  requiredPlatforms: string[];
  /** Where the room runs. Null when the game offers no PlayBound-run multiplayer. */
  hostMode: "self" | "dedicated" | "public" | null;
  /** Modes this game supports, in display order. Fewer than two means no picker. */
  hostModes: Array<{
    mode: "self" | "dedicated" | "public";
    available: boolean;
    label: string;
    hint: string;
  }>;
  /**
   * Community dedicated server the party picked. Present only when hostMode is
   * `public`; Join Game uses the same host/port via `hosted` so existing
   * launchers still connect.
   */
  publicServer: {
    id: string | null;
    name: string | null;
    host: string | null;
    port: number | null;
    mod: string | null;
    protected: boolean;
  } | null;
  /**
   * Port to open for a public self-hosted room, or null. Party members reach a
   * self-hosted host over the overlay and need no mapping, so this is set only
   * when someone outside the party could be joining.
   */
  selfHostPort: { port: number; protocol: "udp" | "tcp" | "both" } | null;
  /** True only after the leader launcher observes the self-hosted server port listening. */
  selfHostReady: boolean;
  eventId: string | null;
  /** True when a password is required; the hash is never returned. */
  hasPassword: boolean;
  /** Host opted into a Discord voice channel. */
  voiceEnabled: boolean;
  discord: {
    voiceChannelId: string | null;
    textChannelId: string | null;
    inviteUrl: string | null;
  };
  /** Present on the caller's live party when GET /api/parties (or GET :id) attaches it. */
  configSync?: ConfigSyncResult | null;
  /**
   * The party's overall state, decided server-side.
   *
   * Present so the web panel and the launcher panel cannot disagree: the
   * launcher is a separate JS package that cannot import this logic, so
   * anything left to the clients gets hand-ported and drifts.
   */
  readiness?: PartyReadiness | null;
  /** True when the requesting user is currently in a game (presence `playing`). */
  selfPlaying?: boolean;
  /** Public VPS room for games that cannot host from a home PC. */
  hosted: {
    enabled: boolean;
    configured?: boolean;
    status: "none" | "pending" | "ready" | "failed";
    host: string | null;
    port: number | null;
    name: string | null;
    error: string | null;
    roomCode?: string | null;
    steps?: string[];
  };
  /**
   * Shared L2 segment for games that only discover peers over LAN and offer
   * no address to connect to. `steps` is what the player still does in-game
   * once their machine is on the segment.
   */
  lan: {
    enabled: boolean;
    status: "none" | "pending" | "ready" | "failed";
    adapterFile: string | null;
    steps: string[];
    error: string | null;
  };
  lastActivity: string;
  createdAt: string;
};
