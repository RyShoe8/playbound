/**
 * Presence & platform sessions — shared vocabulary.
 *
 * Three systems that look similar and must not be confused:
 *
 *   Analytics (TelemetryEvent, lib/liveActivity)
 *     Historical and append-only. "How many people played OpenRA last month."
 *     Never mutated, and untouched by anything here.
 *
 *   Presence (this)
 *     Real-time, one row per user, overwritten constantly. "Is Ryan online
 *     right now, and what is he doing." Has no history by design.
 *
 *   Platform sessions (this)
 *     Historical record of time spent *in PlayBound* — not time spent playing
 *     a game. A game session is analytics; a platform session is "the browser
 *     tab was open for 40 minutes".
 *
 * Stage 2 (friends, online indicators, looking-for-players, invites, parties)
 * should be able to read Presence directly without touching analytics.
 */

/**
 * What a user is doing right now.
 *
 * `party`, `lobby` and `spectating` are unused today and exist so the social
 * stages can adopt them without a schema migration — an enum change on a
 * collection this hot is worth avoiding.
 */
export const PRESENCE_STATUSES = [
  "offline",
  "online",
  "browsing",
  "viewing_game",
  "installing",
  "launching",
  "playing",
  "away",
  // Reserved for Stage 2+.
  "party",
  "lobby",
  "spectating",
] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** Statuses a client may currently report. Reserved ones are rejected. */
export const CLIENT_REPORTABLE_STATUSES = [
  "online",
  "browsing",
  "viewing_game",
  "installing",
  "launching",
  "playing",
  "away",
] as const;
export type ClientReportableStatus = (typeof CLIENT_REPORTABLE_STATUSES)[number];

/** Counts as "currently visible to friends" for Stage 2. */
export function isOnlineStatus(status: PresenceStatus): boolean {
  return status !== "offline";
}

/**
 * Where PlayBound is running. `mobile` and `tv` are reserved for the native
 * apps; nothing reports them yet.
 */
export const PRESENCE_PLATFORMS = ["web", "launcher", "mobile", "tv"] as const;
export type PresencePlatform = (typeof PRESENCE_PLATFORMS)[number];

/**
 * Device form factor. Mirrors DeviceType in lib/compatibility plus "launcher",
 * which is a distinct experience rather than a screen size.
 */
export const PRESENCE_DEVICES = ["desktop", "macos", "tablet", "mobile", "launcher"] as const;
export type PresenceDevice = (typeof PRESENCE_DEVICES)[number];

export const PLATFORM_SESSION_STATUSES = ["active", "ended"] as const;
export type PlatformSessionStatus = (typeof PLATFORM_SESSION_STATUSES)[number];

/** Heartbeat cadence the clients use. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * How long without a heartbeat before a user is considered gone.
 *
 * Two intervals rather than one: a single missed beat is routine (a sleeping
 * tab, a dropped request, a slow network) and must not knock someone offline.
 */
export const STALE_AFTER_MS = 2 * 60_000;

/** Presence as the rest of the app reads it. */
export interface PresenceState {
  userId: string;
  status: PresenceStatus;
  platform: PresencePlatform;
  device: PresenceDevice;
  currentGameId?: string | null;
  currentEditionId?: string | null;
  currentPage?: string | null;
  startedAt: string;
  lastHeartbeat: string;
  updatedAt: string;
}

/** What a client sends on start/heartbeat. Kept tiny — this fires every 60s. */
export interface HeartbeatPayload {
  status?: ClientReportableStatus;
  page?: string | null;
  gameId?: string | null;
  editionId?: string | null;
  sessionId?: string | null;
}

/**
 * Normalise a route for storage.
 *
 * Query strings and hashes are dropped: they carry no signal for "what is this
 * person looking at", and search queries in particular should not be recorded
 * against a user's identity. Length is capped so a crafted URL cannot bloat a
 * document written every minute.
 */
export function normalizePage(page: string | null | undefined): string | null {
  if (!page) return null;
  const raw = String(page).trim();
  if (!raw.startsWith("/")) return null;
  const clean = raw.split("#")[0].split("?")[0];
  return clean.slice(0, 200) || "/";
}
