import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import PlatformSession from "@/lib/models/PlatformSession";
import { deviceTypeFromUaDevice } from "@/lib/compatibility/compatibility";
import {
  normalizePage,
  STALE_AFTER_MS,
  type ClientReportableStatus,
  PRESENCE_OS,
  type PresenceDevice,
  type PresenceOs,
  type PresencePlatform,
} from "@/lib/presence/types";

/**
 * Server-side presence operations, shared by the API routes and the sweep.
 *
 * Kept out of the route handlers so the sweep can reuse the same closing logic
 * a client `end` uses — otherwise a session closed by timeout and one closed
 * by a tab close would drift apart in how duration is computed.
 */

/** Launcher requests identify themselves; everything else is a browser. */
export function detectPlatform(userAgent: string | null | undefined): PresencePlatform {
  const ua = userAgent || "";
  if (/playbound-launcher/i.test(ua)) return "launcher";
  return "web";
}

/**
 * Form factor from the User-Agent.
 *
 * Derived server-side rather than trusted from the client, and reusing the
 * catalog's existing device vocabulary so presence and compatibility agree on
 * what "tablet" means.
 */
export function detectDevice(
  userAgent: string | null | undefined,
  platform: PresencePlatform
): PresenceDevice {
  if (platform === "launcher") return "launcher";
  const ua = userAgent || "";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return "tablet";
  }
  if (/iPhone|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return "mobile";
  }
  // Falls through the shared helper so an unrecognised UA lands wherever the
  // rest of the app would put it.
  return deviceTypeFromUaDevice(null) as PresenceDevice;
}

/**
 * Operating system from the User-Agent.
 *
 * Separate from device on purpose: a MacBook is macOS *and* a desktop, and
 * Stage 2 wants the OS to answer "can this friend run what I'm inviting them
 * to" — a question form factor cannot answer.
 *
 * The launcher states its OS explicitly in its User-Agent
 * (`playbound-launcher/0.1.33 (macos; arm64)`), so that is checked first and
 * trusted over browser sniffing.
 */
export function detectOs(userAgent: string | null | undefined): PresenceOs {
  const ua = userAgent || "";

  const launcher = /playbound-launcher\/\S+\s*\(([^;)]+)/i.exec(ua);
  if (launcher) {
    const reported = launcher[1].trim().toLowerCase();
    if ((PRESENCE_OS as readonly string[]).includes(reported)) {
      return reported as PresenceOs;
    }
  }

  // Order matters: iOS and Android must be tested before the desktop families,
  // since both carry tokens ("like Mac OS X", "Linux") that would otherwise
  // match first.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return "unknown";
}

export interface PresenceContext {
  userId: string;
  userAgent: string | null;
  referrer: string | null;
}

export interface PresenceUpdate {
  status?: ClientReportableStatus;
  page?: string | null;
  gameId?: string | null;
  editionId?: string | null;
  sessionId?: string | null;
}

type PresenceLean = {
  status?: string;
  platform?: string;
  lastHeartbeat?: Date | string | null;
  currentGameId?: string | null;
  currentEditionId?: string | null;
} | null;

/**
 * When the launcher recently reported `playing`, a concurrent browser tab must
 * not downgrade that row to browsing/online and wipe the current game.
 */
function shouldPreserveLauncherPlaying(
  existing: PresenceLean,
  reportingPlatform: PresencePlatform,
  update: PresenceUpdate,
  now: Date
): boolean {
  if (reportingPlatform !== "web" || !existing) return false;
  if (existing.status !== "playing" || existing.platform !== "launcher") return false;
  const hb = existing.lastHeartbeat ? new Date(existing.lastHeartbeat).getTime() : 0;
  if (!hb || now.getTime() - hb >= STALE_AFTER_MS) return false;
  const downgradeStatus = update.status != null && update.status !== "playing";
  const clearGame =
    update.gameId !== undefined &&
    (update.gameId == null || update.gameId === "") &&
    Boolean(existing.currentGameId);
  return downgradeStatus || clearGame;
}

/**
 * Begin (or resume) presence and an active platform session.
 *
 * Safe to call repeatedly: presence is a single upserted row, and a session is
 * keyed by the client's own sessionId, so a component remounting or a second
 * tab reusing the id will not open duplicate sessions.
 */
export async function startPresence(ctx: PresenceContext, update: PresenceUpdate) {
  await dbConnect();
  const now = new Date();
  const platform = detectPlatform(ctx.userAgent);
  const device = detectDevice(ctx.userAgent, platform);
  const os = detectOs(ctx.userAgent);
  const page = normalizePage(update.page);

  const existing = (await Presence.findOne({ userId: ctx.userId }).lean()) as PresenceLean;
  const preserve = shouldPreserveLauncherPlaying(existing, platform, update, now);

  const set: Record<string, unknown> = {
    lastHeartbeat: now,
    currentPage: page,
  };
  if (preserve) {
    // Keep launcher playing/game; still refresh heartbeat so presence does not stale.
  } else {
    set.status = update.status ?? "online";
    set.platform = platform;
    set.device = device;
    set.os = os;
    set.currentGameId = update.gameId ?? null;
    set.currentEditionId = update.editionId ?? null;
  }

  await Presence.findOneAndUpdate(
    { userId: ctx.userId },
    {
      $set: set,
      // Only stamped when the row is created, so reconnecting does not reset
      // how long the user has been present.
      $setOnInsert: { userId: ctx.userId, startedAt: now },
    },
    { upsert: true, returnDocument: "after" }
  );

  let sessionId = update.sessionId || null;
  if (sessionId) {
    const existing = await PlatformSession.findOneAndUpdate(
      { sessionId, userId: ctx.userId, status: "active" },
      { $set: { lastHeartbeat: now } },
      { returnDocument: "after" }
    );
    if (existing) return { platform, device, os, sessionId };
  }

  // No usable session — open one. crypto.randomUUID is available in the Node
  // and edge runtimes Next serves routes from.
  sessionId = sessionId || crypto.randomUUID();
  await PlatformSession.create({
    sessionId,
    userId: ctx.userId,
    platform,
    device,
    os,
    status: "active",
    startedAt: now,
    lastHeartbeat: now,
    referrer: ctx.referrer?.slice(0, 500) ?? null,
    userAgent: ctx.userAgent?.slice(0, 500) ?? null,
  });

  return { platform, device, os, sessionId };
}

/**
 * Record a heartbeat.
 *
 * This is the hot path — it runs once a minute for every open tab — so it is
 * two targeted updates by indexed key and nothing else. No reads, no
 * aggregation, and only the fields the client actually reported.
 */
export async function heartbeat(ctx: PresenceContext, update: PresenceUpdate) {
  await dbConnect();
  const now = new Date();
  const platform = detectPlatform(ctx.userAgent);

  const existing = (await Presence.findOne({ userId: ctx.userId }).lean()) as PresenceLean;
  const preserve = shouldPreserveLauncherPlaying(existing, platform, update, now);

  const set: Record<string, unknown> = { lastHeartbeat: now };
  if (!preserve) {
    if (update.status) set.status = update.status;
    if (update.gameId !== undefined) set.currentGameId = update.gameId || null;
    if (update.editionId !== undefined) set.currentEditionId = update.editionId || null;
  }
  // `page` is only written when the client sends the key at all, so a
  // heartbeat that omits it leaves the last known page intact rather than
  // blanking it. Even when preserving playing, web may update currentPage.
  if (update.page !== undefined) set.currentPage = normalizePage(update.page);

  const presence = await Presence.findOneAndUpdate(
    { userId: ctx.userId },
    {
      $set: set,
      $setOnInsert: { userId: ctx.userId, startedAt: now },
    },
    // Upsert so a heartbeat arriving after a sweep (or a server restart)
    // silently restores presence instead of failing.
    { upsert: true, returnDocument: "after" }
  ).lean();

  if (update.sessionId) {
    await PlatformSession.updateOne(
      { sessionId: update.sessionId, userId: ctx.userId, status: "active" },
      { $set: { lastHeartbeat: now } }
    );
  }

  if (!preserve) {
    const nextStatus = (set.status as string | undefined) ?? existing?.status ?? null;
    const nextGame =
      set.currentGameId !== undefined
        ? (set.currentGameId as string | null)
        : existing?.currentGameId ?? null;
    void import("@/lib/playTogether/activityNotify").then(({ maybeNotifyFriendsStartedPlaying }) =>
      maybeNotifyFriendsStartedPlaying({
        userId: ctx.userId,
        previousStatus: existing?.status,
        previousGameId: existing?.currentGameId,
        nextStatus,
        nextGameId: nextGame,
      })
    );
  }

  return presence;
}

/** Close a session row consistently, whether ended by a client or the sweep. */
function closeSessionUpdate(now: Date) {
  return [
    {
      $set: {
        status: "ended",
        endedAt: now,
        durationSeconds: {
          $max: [0, { $floor: { $divide: [{ $subtract: [now, "$startedAt"] }, 1000] } }],
        },
      },
    },
  ];
}

/**
 * Mark a user offline and close their session.
 *
 * Presence is set to offline rather than deleted: Stage 2 wants "last seen",
 * and a missing row cannot express that.
 */
export async function endPresence(ctx: PresenceContext, sessionId?: string | null) {
  await dbConnect();
  const now = new Date();

  await Presence.updateOne(
    { userId: ctx.userId },
    {
      $set: {
        status: "offline",
        currentGameId: null,
        currentEditionId: null,
        currentPage: null,
        lastHeartbeat: now,
      },
    }
  );

  const filter: Record<string, unknown> = { userId: ctx.userId, status: "active" };
  if (sessionId) filter.sessionId = sessionId;
  await PlatformSession.updateMany(filter, closeSessionUpdate(now), { updatePipeline: true });
}

/**
 * Close out anyone whose heartbeat has aged out.
 *
 * Needed because the common ways to leave — closing a laptop, losing signal,
 * killing a tab the browser never told us about — produce no `end` call at
 * all. Without this, presence would report people online indefinitely and
 * every platform session would stay open forever.
 *
 * Returns counts so the cron log shows whether it is doing anything.
 */
export async function sweepStalePresence(now = new Date()) {
  await dbConnect();
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);

  const presence = await Presence.updateMany(
    { status: { $ne: "offline" }, lastHeartbeat: { $lt: cutoff } },
    {
      $set: {
        status: "offline",
        currentGameId: null,
        currentEditionId: null,
        currentPage: null,
        lookingForPlayersUntil: null,
        lookingForPlayersGameId: null,
      },
    }
  );

  const lfgCleared = await Presence.updateMany(
    { lookingForPlayersUntil: { $ne: null, $lte: now } },
    { $set: { lookingForPlayersUntil: null, lookingForPlayersGameId: null } }
  );

  const sessions = await PlatformSession.updateMany(
    { status: "active", lastHeartbeat: { $lt: cutoff } },
    closeSessionUpdate(now),
    { updatePipeline: true }
  );

  return {
    presenceMarkedOffline: presence.modifiedCount ?? 0,
    lfgCleared: lfgCleared.modifiedCount ?? 0,
    sessionsEnded: sessions.modifiedCount ?? 0,
    cutoff: cutoff.toISOString(),
  };
}
