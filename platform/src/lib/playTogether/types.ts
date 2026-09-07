/**
 * Play Together (Friends Phase 3) — shared vocabulary.
 * Discord remains the chat layer; these types never model messaging.
 */

import type { PartyReadiness } from "@/lib/playTogether/partyReadiness";
import type { PartyActions } from "@/lib/playTogether/partyActions";
import type { PartyHostMode } from "@/lib/multiplayer/adapters";
import type { HostModeOption } from "@/lib/multiplayer/hostModes";

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

/**
 * Fallback default when no admin setting has been read.
 *
 * `defaultPartySize` in PlatformLimits is the real default and is editable in
 * the admin UI; this is what a read path uses before it has one, and what
 * existing documents fall back to.
 */
export const PARTY_MAX_SIZE = 8;

/**
 * A runaway guard on the Party document, and nothing else.
 *
 * This is the one place a compile-time number is unavoidable: the Mongoose
 * schema is built at module load, before any database read, so its validator
 * cannot ask an admin setting how large a party may be.
 *
 * So it is deliberately not a business limit. The number that decides how
 * large a party can actually get is `maxPartySize` in PlatformLimits, which is
 * editable in the admin UI and enforced on every create and join. This exists
 * only to stop a bug writing an unbounded members array into a document, and
 * is set far above any package worth selling.
 */
export const PARTY_STRUCTURAL_MAX = 500;

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
/**
 * What this party could grow to, right now.
 *
 * A live figure, not a setting: free seats are a platform-wide pool, so a
 * party's headroom shrinks when other people play and returns when they stop.
 * Sent with every payload so a screen that polls stays honest.
 */
export type PartyCapacity = {
  /** Largest this party can currently be. */
  capacity: number;
  /** Seats it could still fill. */
  seatsRemaining: number;
  /** Of the capacity, how much the host's own plan covers. */
  fromPlan: number;
  /** The rest, drawn from the shared pool. */
  fromPool: number;
  /** Free seats left platform-wide, net of this party. */
  poolAvailable: number;
  /** True when the cap, not the pool, is what stops it growing. */
  atHardCap: boolean;
  cap: number;
  /** True when that cap is the free limit — i.e. subscribing would lift it. */
  capIsFreeLimit: boolean;
};

export type PartyPayload = {
  id: string;
  capacity: PartyCapacity;
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
  /**
   * Where the room runs. Null when the game offers no PlayBound-run
   * multiplayer.
   *
   * Spelt out here as a copy of PartyHostMode, which meant adding "couch" to
   * the real type left this one behind and the compiler caught two assignments
   * it no longer accepted. Referencing the source avoids the next drift.
   */
  hostMode: PartyHostMode | null;
  /** Modes this game supports, in display order. Fewer than two means no picker. */
  hostModes: HostModeOption[];
  /**
   * Whether PlayBound can administer this party's server, and when.
   *
   * Resolved here rather than by each client for the same reason as hostMode:
   * the launcher cannot import the settings profiles, and a second answer to
   * "does this game have server controls" is a second thing to drift. It is
   * what the party panel uses to tell the host the in-game overlay is worth
   * opening — a note about controls that do not exist is worse than silence.
   */
  serverControl: {
    supported: boolean;
    /** "pre-launch" while the room has not started; null when unsupported. */
    phase: "live" | "pre-launch" | null;
    /** Why there are no controls, when there are none. */
    reason: string | null;
  };
  /**
   * Every couch-only game in the catalog, so the game picker can mark them
   * before one is chosen. Static, not per-party — see couchOnlyGameSlugs.
   */
  couchOnlyGames: string[];
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
  /**
   * The action bar, resolved for the requesting viewer. Null when nobody is
   * asking (a public listing). Clients render it rather than recomputing the
   * gating — see partyActions.ts.
   */
  actions?: PartyActions | null;
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
    configured?: boolean;
    status: "none" | "pending" | "ready" | "failed";
    adapterFile: string | null;
    steps: string[];
    error: string | null;
  };
  /**
   * Phone-controller session for a couch party. `enabled` means this game has
   * no networking, so only the leader launches it and everyone else joins by
   * opening `joinUrl` on a phone.
   */
  couch: {
    enabled: boolean;
    status: "none" | "pending" | "ready" | "failed";
    joinCode: string | null;
    joinUrl: string | null;
    error: string | null;
  };
  lastActivity: string;
  createdAt: string;
};
