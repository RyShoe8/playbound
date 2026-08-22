/**
 * Phase 4 — Party service.
 *
 * A party is a PlayBound coordination object. Discord remains the chat layer;
 * PlayBound handles who is playing together, configuration, readiness,
 * and launching.
 *
 * Every mutation touches `lastActivity` so the stale sweep has a single
 * reliable indicator of whether a party is still alive.
 */

import { createHash, randomBytes } from "crypto";
import { Types, type Document } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import Presence from "@/lib/models/Presence";
import PartyMessage from "@/lib/models/PartyMessage";
import { getGame } from "@/lib/catalog";
import { listEditionsForGame } from "@/lib/editions";
import {
  PARTY_MAX_SIZE,
  PARTY_IDLE_TIMEOUT_MS,
  type PartyStatus,
  type PartyVisibility,
  type PartyPayload,
  type PartyMemberPayload,
  type ConfigSyncMember,
  type ConfigSyncResult,
  normalizePartyName,
} from "@/lib/playTogether/types";
import { STALE_AFTER_MS } from "@/lib/presence/types";
import { trackPartyEvent, trackPartyFailure } from "@/lib/playTogether/partyTelemetry";
import { setPresenceParty, clearPresenceForParty } from "@/lib/presence/server";
import {
  cleanupPartyDiscordVoice,
  placePartyDiscordVoice,
  renamePartyDiscordVoice,
  type PartyVoiceFollowup,
} from "@/lib/playTogether/discordPartyProvision";
import {
  hostedPayloadFromDoc,
  provisionPartyHost,
  reconcilePartyHostAlive,
  releasePartyHost,
  type PartyHostFields,
} from "@/lib/gameHost/provision";
import {
  lanPayloadFromDoc,
  provisionPartyLan,
  releasePartyLan,
  type PartyLanFields,
} from "@/lib/virtualLan/provision";
import { isHostableGame, type HostedStatus } from "@/lib/gameHost/catalog";
import { modBaseGameSlugsForCatalogGame } from "@/lib/catalogGameAliases";
import { isVirtualLanGame } from "@/lib/multiplayer/adapters";
import {
  BASE_EDITION_KEY,
  isBaseEditionSlug,
  libraryHasRequiredEdition,
} from "@/lib/playTogether/editionMatch";
import { computePartyReadiness } from "@/lib/playTogether/partyReadiness";
import { applyPresenceFreshness } from "@/lib/friends/presenceMask";
import {
  editionsFromRow,
  primaryEditionFromRow,
} from "@/lib/library/installedEditions";
import {
  canJoinParty,
  canLeaveParty,
  canRemoveMember,
  canLaunch,
  canTransitionTo,
  nextLeader,
  derivePartyStatus,
  isLeader,
  readySummary,
  type RuleParty,
  type RuleMember,
} from "@/lib/playTogether/partyRules";

type PartyDoc = Document & {
  _id: Types.ObjectId;
  gameSlug: string;
  status: PartyStatus;
  members: RuleMember[];
  hosted?: PartyHostFields;
  lan?: PartyLanFields;
  maxSize?: number;
  editionSlug?: string | null;
  lastActivity?: Date;
  discord?: { voiceChannelId?: string | null; relocatedAt?: Date | null };
  save: () => Promise<unknown>;
};

function resetPartyConnectState(doc: PartyDoc) {
  if (doc.hosted) {
    doc.hosted.status = "none";
    doc.hosted.error = null;
    doc.hosted.host = null;
    doc.hosted.port = null;
    doc.hosted.roomId = null;
    doc.hosted.name = null;
    doc.hosted.roomCode = null;
  }
  if (doc.lan) {
    doc.lan.status = "none";
    doc.lan.error = null;
    doc.lan.groupId = undefined;
    doc.lan.policyId = undefined;
    doc.lan.setupKeyId = undefined;
    doc.lan.setupKey = undefined;
  }
}

function partyConnectCanAutoProvision(doc: PartyDoc): boolean {
  const { allReady: allReadyUp } = readySummary(doc.members);
  const soloReady = doc.members.length === 1 && Boolean(doc.members[0]?.ready);
  if (!allReadyUp && !soloReady) return false;
  if (doc.status === "ended" || doc.status === "launching" || doc.status === "playing") {
    return false;
  }
  return true;
}

async function maybeProvisionPartyConnect(doc: PartyDoc): Promise<void> {
  if (!doc.gameSlug || !partyConnectCanAutoProvision(doc)) return;
  const slug = String(doc.gameSlug);

  if (isHostableGame(slug)) {
    const hs = (doc.hosted?.status || "none") as HostedStatus;
    if (hs === "none" || hs === "failed") {
      await provisionPartyHost(doc);
    }
  }
  if (isVirtualLanGame(slug)) {
    const ls = doc.lan?.status || "none";
    if (ls === "none" || ls === "failed") {
      await provisionPartyLan(doc);
    }
  }
}

async function ensurePartyConnectReady(
  doc: PartyDoc
): Promise<{ ok: true } | { error: string }> {
  const slug = String(doc.gameSlug || "");

  if (isHostableGame(slug)) {
    await reconcilePartyHostAlive(doc);
    let hs = (doc.hosted?.status || "none") as HostedStatus;
    if (hs === "ready" && doc.hosted?.host && doc.hosted?.port) {
      /* ready */
    } else if (hs === "pending") {
      return { error: "Server is still starting — wait a moment" };
    } else {
      if (hs === "failed" || hs === "none") {
        await provisionPartyHost(doc);
      }
      hs = (doc.hosted?.status || "none") as HostedStatus;
      if (hs === "pending") {
        return { error: "Server is still starting — wait a moment" };
      }
      if (hs !== "ready" || !doc.hosted?.host || !doc.hosted?.port) {
        return {
          error: doc.hosted?.error || "Could not start the PlayBound server.",
        };
      }
    }
  }

  if (isVirtualLanGame(slug)) {
    let ls = doc.lan?.status || "none";
    if (ls === "ready" && doc.lan?.setupKey) {
      /* ready */
    } else if (ls === "pending") {
      return { error: "Party network is still starting — wait a moment" };
    } else {
      if (ls === "failed" || ls === "none") {
        await provisionPartyLan(doc);
      }
      ls = doc.lan?.status || "none";
      if (ls === "pending") {
        return { error: "Party network is still starting — wait a moment" };
      }
      if (ls !== "ready") {
        return {
          error: doc.lan?.error || "Could not set up the party network.",
        };
      }
    }
  }

  return { ok: true };
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

async function acceptedFriendIds(userId: string): Promise<string[]> {
  const docs = await Friend.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { recipientId: userId }],
  })
    .select("requesterId recipientId")
    .lean();
  return docs.map((f) => {
    const a = String(f.requesterId);
    const b = String(f.recipientId);
    return a === userId ? b : a;
  });
}

function toRuleParty(doc: Record<string, unknown>): RuleParty {
  const members = (doc.members as Array<Record<string, unknown>>) || [];
  return {
    leaderId: String(doc.leaderId),
    members: members.map(
      (m): RuleMember => ({
        userId: String(m.userId),
        role: (m.role as "leader" | "member") || "member",
        ready: Boolean(m.ready),
        joinedAt: m.joinedAt as Date,
      })
    ),
    status: (doc.status as PartyStatus) || "forming",
    visibility: (doc.visibility as PartyVisibility) || "friends",
    maxSize: (doc.maxSize as number) || PARTY_MAX_SIZE,
  };
}

async function resolveUsernames(
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select("username")
    .lean();
  return new Map(
    users.map((u) => [String(u._id), String(u.username || "Player")])
  );
}

const SKIP_VOICE: PartyVoiceFollowup = {
  needsDiscordLink: false,
  inviteUrl: null,
  moved: false,
};

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

async function findActiveLeaderParty(userId: string) {
  return Party.findOne({
    leaderId: userId,
    status: { $nin: ["ended"] },
  }).lean();
}

/** Drop every live party except `keepPartyId` — one active membership per user. */
async function leaveOtherActiveParties(userId: string, keepPartyId?: string) {
  const filter: Record<string, unknown> = {
    status: { $nin: ["ended"] },
    "members.userId": userId,
  };
  if (keepPartyId) filter._id = { $ne: keepPartyId };
  const docs = await Party.find(filter);
  for (const doc of docs) {
    await leaveParty(String(doc._id), userId);
  }
}

type PartyDocLean = Record<string, unknown> & {
  _id: unknown;
  lastActivity?: Date;
};

/** One canonical party when legacy rows still have the user in multiple rosters. */
async function pickCanonicalPartyDoc(
  docs: PartyDocLean[],
  userId: string
): Promise<PartyDocLean | null> {
  if (docs.length === 0) return null;
  if (docs.length === 1) return docs[0];

  const presence = await Presence.findOne({ userId }).select("currentPartyId").lean();
  const presencePartyId = presence?.currentPartyId ? String(presence.currentPartyId) : null;

  let canonical = docs[0];
  if (presencePartyId) {
    const match = docs.find((d) => String(d._id) === presencePartyId);
    if (match) canonical = match;
  }

  for (const d of docs) {
    if (String(d._id) !== String(canonical._id)) {
      console.warn(
        `[party] leaving stale party ${String(d._id)} for ${userId} (canonical ${String(canonical._id)})`
      );
      await leaveParty(String(d._id), userId);
    }
  }
  return canonical;
}

async function partyPayloadForDoc(doc: Record<string, unknown>): Promise<PartyPayload> {
  const memberIds = [
    String(doc.leaderId),
    ...((doc.members as Array<{ userId: unknown }>) || []).map((m) => String(m.userId)),
  ];
  const gameSlug = String(doc.gameSlug || "");
  const [nameById, game] = await Promise.all([
    resolveUsernames([...new Set(memberIds)]),
    gameSlug ? getGame(gameSlug, { includeTesting: true }) : Promise.resolve(null),
  ]);
  return serializeParty(doc, nameById, game?.title || null);
}

function hashPartyPassword(password: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function serializeParty(
  doc: Record<string, unknown>,
  nameById: Map<string, string>,
  gameTitle: string | null
): PartyPayload {
  const members = (doc.members as Array<Record<string, unknown>>) || [];
  const leaderId = String(doc.leaderId);
  const discord = (doc.discord as Record<string, unknown>) || {};
  return {
    id: String(doc._id),
    leaderId,
    leaderUsername: nameById.get(leaderId) || "Player",
    name: normalizePartyName(doc.name),
    members: members.map(
      (m): PartyMemberPayload => ({
        userId: String(m.userId),
        username: nameById.get(String(m.userId)) || "Player",
        role: (m.role as "leader" | "member") || "member",
        ready: Boolean(m.ready),
        joinedAt: (m.joinedAt as Date)?.toISOString() || new Date().toISOString(),
      })
    ),
    gameSlug: String(doc.gameSlug || ""),
    gameTitle,
    editionSlug: (doc.editionSlug as string) || null,
    modSlugs: (doc.modSlugs as string[]) || [],
    status: (doc.status as PartyStatus) || "forming",
    visibility: (doc.visibility as PartyVisibility) || "friends",
    hasPassword: Boolean(doc.passwordHash),
    voiceEnabled: doc.voiceEnabled !== false,
    maxSize: (doc.maxSize as number) || PARTY_MAX_SIZE,
    eventId: doc.eventId ? String(doc.eventId) : null,
    discord: {
      voiceChannelId: (discord.voiceChannelId as string) || null,
      textChannelId: (discord.textChannelId as string) || null,
      inviteUrl: (discord.inviteUrl as string) || null,
    },
    hosted: hostedPayloadFromDoc(
      String(doc.gameSlug || ""),
      (doc.hosted as Parameters<typeof hostedPayloadFromDoc>[1]) || null
    ),
    lan: lanPayloadFromDoc(
      String(doc.gameSlug || ""),
      (doc.lan as Parameters<typeof lanPayloadFromDoc>[1]) || null
    ),
    lastActivity: (doc.lastActivity as Date)?.toISOString() || new Date().toISOString(),
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString(),
  };
}

async function attachConfigSync(
  party: PartyPayload,
  viewerUserId?: string
): Promise<PartyPayload> {
  if (!party.gameSlug || party.status === "ended") {
    return { ...party, readiness: readinessFor(party, null) };
  }
  try {
    const result = await checkConfigSync(party.id);
    if ("error" in result) return { ...party, readiness: readinessFor(party, null) };
    const selfPlaying = viewerUserId
      ? Boolean(result.sync.members.find((m) => m.userId === viewerUserId)?.playing)
      : false;
    return {
      ...party,
      configSync: result.sync,
      selfPlaying,
      readiness: readinessFor(party, result.sync),
    };
  } catch (err) {
    /*
     * Logged, not recorded.
     *
     * This catch fires on a failed database read, and the panel polls it every
     * 1.5s. Writing an event here meant a struggling cluster generated a write
     * per poll per viewer describing the fact that it was struggling — load
     * caused by the reporting of load. trackPartyFailure now filters
     * infrastructure errors for exactly this reason; keeping the call would
     * still be misleading about where the failure gets seen.
     */
    console.warn("[party:sync] config-sync failed", err instanceof Error ? err.message : err);
    return { ...party, readiness: readinessFor(party, null) };
  }
}

/**
 * Both clients render this instead of deciding for themselves, which is what
 * stops the web panel and the launcher panel from disagreeing.
 */
function readinessFor(party: PartyPayload, sync: ConfigSyncResult | null) {
  return computePartyReadiness({
    gameSlug: party.gameSlug,
    status: party.status,
    members: party.members.map((m) => ({ userId: m.userId, ready: m.ready })),
    sync: sync
      ? {
          allInSync: sync.allInSync,
          members: sync.members.map((m) => ({
            userId: m.userId,
            hasGame: m.hasGame,
            hasEdition: m.hasEdition,
            missingMods: m.missingMods,
          })),
        }
      : null,
  });
}

/* ─── create (4B) ────────────────────────────────────────────────────────── */

export async function createParty(opts: {
  userId: string;
  name?: string | null;
  gameSlug?: string | null;
  editionSlug?: string | null;
  modSlugs?: string[];
  visibility?: PartyVisibility;
  maxSize?: number;
  eventId?: string | null;
  password?: string | null;
  wantVoice?: boolean;
}): Promise<
  | ({ party: PartyPayload; status: 201 | 200; existing?: boolean } & PartyVoiceFollowup)
  | { error: string; status: 400 | 404 }
> {
  await dbConnect();

  const gameSlug = typeof opts.gameSlug === "string" ? opts.gameSlug.trim() : "";
  const game = gameSlug ? await getGame(gameSlug, { includeTesting: true }) : null;
  if (gameSlug && !game) return { error: "Game not found", status: 404 };

  // One active party per leader — return it idempotently instead of 409/500 races.
  const existing = await findActiveLeaderParty(opts.userId);
  if (existing) {
    const existingId = String(existing._id);
    await leaveOtherActiveParties(opts.userId, existingId);
    await setPresenceParty(opts.userId, {
      partyId: existingId,
      gameSlug: String(existing.gameSlug || "") || null,
    });
    const party = await partyPayloadForDoc(existing as Record<string, unknown>);
    return { party, status: 200, existing: true, ...SKIP_VOICE };
  }

  await leaveOtherActiveParties(opts.userId);

  const visibility = opts.visibility || "friends";
  const wantVoice = opts.wantVoice !== false;
  let passwordSalt: string | null = null;
  let passwordHash: string | null = null;
  if (visibility === "password") {
    const password = String(opts.password || "");
    if (password.length < 4) {
      return { error: "Password must be at least 4 characters", status: 400 };
    }
    passwordSalt = randomBytes(16).toString("hex");
    passwordHash = hashPartyPassword(password, passwordSalt);
  }

  const now = new Date();
  let doc;
  try {
    doc = await Party.create({
      leaderId: opts.userId,
      members: [
        {
          userId: opts.userId,
          role: "leader",
          ready: false,
          joinedAt: now,
        },
      ],
      name: normalizePartyName(opts.name),
      gameSlug,
      editionSlug: opts.editionSlug || null,
      modSlugs: opts.modSlugs || [],
      status: "forming",
      visibility,
      passwordSalt,
      passwordHash,
      voiceEnabled: wantVoice,
      maxSize: Math.min(Math.max(opts.maxSize || PARTY_MAX_SIZE, 2), 20),
      eventId: opts.eventId || null,
      lastActivity: now,
    });
  } catch (err) {
    if (isMongoDuplicateKey(err)) {
      const raced = await findActiveLeaderParty(opts.userId);
      if (raced) {
        const racedId = String(raced._id);
        await leaveOtherActiveParties(opts.userId, racedId);
        await setPresenceParty(opts.userId, {
          partyId: racedId,
          gameSlug: String(raced.gameSlug || "") || null,
        });
        const party = await partyPayloadForDoc(raced as Record<string, unknown>);
        return { party, status: 200, existing: true, ...SKIP_VOICE };
      }
    }
    throw err;
  }

  await setPresenceParty(opts.userId, {
    partyId: String(doc._id),
    gameSlug: gameSlug || null,
  });
  const party = await partyPayloadForDoc(
    (doc.toObject ? doc.toObject() : doc) as Record<string, unknown>
  );
  trackPartyEvent("party_created", {
    partyId: party.id,
    gameSlug: party.gameSlug || null,
    userId: opts.userId,
    visibility: party.visibility,
  });
  return {
    party,
    status: 201,
    ...SKIP_VOICE,
  };
}

/* ─── join (4C, 4E) ──────────────────────────────────────────────────────── */

export async function joinParty(
  partyId: string,
  userId: string,
  password?: string
): Promise<
  | ({ party: PartyPayload; status: 200 } & PartyVoiceFollowup)
  | { error: string; status: 400 | 403 | 404 }
> {
  await dbConnect();

  let doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  const rp = toRuleParty(doc.toObject());
  const friendIds = await acceptedFriendIds(userId);
  const isFriend = friendIds.includes(rp.leaderId) ||
    rp.members.some((m) => friendIds.includes(m.userId));

  let passwordOk = false;
  if (doc.visibility === "password") {
    const salt = String(doc.passwordSalt || "");
    const stored = String(doc.passwordHash || "");
    const incoming = String(password || "");
    if (!incoming) {
      return { error: "Password required", status: 403 };
    }
    if (!salt || !stored || hashPartyPassword(incoming, salt) !== stored) {
      return { error: "Incorrect password", status: 403 };
    }
    passwordOk = true;
  }

  await leaveOtherActiveParties(userId, partyId);

  const alreadyMember = rp.members.some((m) => m.userId === userId);
  if (alreadyMember) {
    await setPresenceParty(userId, { partyId: String(doc._id), gameSlug: String(doc.gameSlug) });
    const memberIds = doc.members.map((m: { userId: unknown }) => String(m.userId));
    const [nameById, game] = await Promise.all([
      resolveUsernames(memberIds),
      getGame(doc.gameSlug, { includeTesting: true }),
    ]);
    return {
      party: serializeParty(doc.toObject(), nameById, game?.title || null),
      status: 200,
      ...SKIP_VOICE,
    };
  }

  const check = canJoinParty(rp, userId, isFriend, passwordOk);
  if (!check.ok) return { error: check.reason || "Cannot join", status: 403 };

  const now = new Date();

  /*
   * The membership check and the write have to be one operation.
   *
   * Everything above reads from a snapshot taken by findById. Two clicks in
   * quick succession both load a party they are not in, both pass
   * canJoinParty, and both call save — and mongoose turns `.push()` on a
   * document array into an atomic `$push`, so the two writes do not overwrite
   * each other, they append twice. The member appears in the party twice.
   *
   * Pushing under a filter that excludes existing members closes the window:
   * whichever write lands second matches nothing and changes nothing.
   */
  const claimed = await Party.updateOne(
    { _id: doc._id, "members.userId": { $ne: userId } },
    {
      $push: { members: { userId, role: "member", ready: false, joinedAt: now } },
      $set: { lastActivity: now },
    }
  );

  /*
   * Losing that race is not an error. The user asked to be in this party and
   * they are, so the second click returns the party rather than a failure —
   * anything else would surface a scary message for a duplicate click.
   */
  const refreshed = await Party.findById(partyId);
  if (!refreshed) return { error: "Party not found", status: 404 };
  if (!claimed.modifiedCount) {
    console.warn(`[party] duplicate join ignored for ${userId} in ${partyId}`);
  }
  doc = refreshed;

  // Re-derive status (e.g., if everyone was ready and a new unready member joined).
  const newRp = toRuleParty(doc.toObject());
  const nextStatus = derivePartyStatus(doc.status as PartyStatus, newRp.members);
  if (nextStatus !== doc.status) {
    doc.status = nextStatus;
    await doc.save();
  }

  await setPresenceParty(userId, { partyId: String(doc._id), gameSlug: String(doc.gameSlug) });

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  const party = serializeParty(doc.toObject(), nameById, game?.title || null);
  trackPartyEvent("party_joined", {
    partyId: party.id,
    gameSlug: party.gameSlug || null,
    userId,
  });
  return {
    party,
    status: 200,
    ...SKIP_VOICE,
  };
}

/* ─── leave (4L) ─────────────────────────────────────────────────────────── */

export async function leaveParty(
  partyId: string,
  userId: string
): Promise<{ party: PartyPayload | null; status: 200 } | { error: string; status: 400 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  const rp = toRuleParty(doc.toObject());
  const check = canLeaveParty(rp, userId);
  if (!check.ok) return { error: check.reason || "Cannot leave", status: 400 };

  const now = new Date();
  doc.members = doc.members.filter(
    (m: { userId: unknown }) => String(m.userId) !== userId
  );
  doc.lastActivity = now;

  // Leadership handoff.
  if (rp.leaderId === userId) {
    const newLeaderId = nextLeader(rp.members, userId);
    if (newLeaderId) {
      doc.leaderId = newLeaderId;
      const leaderMember = doc.members.find(
        (m: { userId: unknown }) => String(m.userId) === newLeaderId
      );
      if (leaderMember) leaderMember.role = "leader";
    } else {
      // Last person leaving — end the party.
      doc.status = "ended";
      doc.endedAt = now;
      await releasePartyHost(doc);
      await releasePartyLan(doc);
      await doc.save();
      await setPresenceParty(userId, { partyId: null });
      await clearPresenceForParty(String(doc._id));
      await cleanupPartyDiscordVoice(doc);
      trackPartyEvent("party_left", {
        partyId: String(doc._id),
        gameSlug: String(doc.gameSlug || "") || null,
        userId,
        ended: true,
      });
      trackPartyEvent("party_ended", {
        partyId: String(doc._id),
        gameSlug: String(doc.gameSlug || "") || null,
        userId,
        reason: "last_member",
      });
      return { party: null, status: 200 };
    }
  }

  // Re-derive status.
  const newRp = toRuleParty(doc.toObject());
  doc.status = derivePartyStatus(doc.status as PartyStatus, newRp.members);
  if (doc.members.length === 0) {
    doc.status = "ended";
    doc.endedAt = now;
  }

  if (doc.status === "ended") {
    await releasePartyHost(doc);
    await releasePartyLan(doc);
  }
  await doc.save();
  await setPresenceParty(userId, { partyId: null });
  if (doc.status === "ended") {
    await clearPresenceForParty(String(doc._id));
    await cleanupPartyDiscordVoice(doc);
  }

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  const leftParty = serializeParty(doc.toObject(), nameById, game?.title || null);
  trackPartyEvent("party_left", {
    partyId: String(doc._id),
    gameSlug: leftParty.gameSlug || null,
    userId,
    ended: doc.status === "ended",
  });
  if (doc.status === "ended") {
    trackPartyEvent("party_ended", {
      partyId: String(doc._id),
      gameSlug: leftParty.gameSlug || null,
      userId,
      reason: "empty",
    });
  }
  return {
    party: leftParty,
    status: 200,
  };
}

/**
 * Drop this user from every live party. Used when they actually go offline
 * (launcher quit, tab close, stale heartbeat) — not "appear offline".
 */
export async function leavePartiesOnDisconnect(userId: string): Promise<number> {
  await dbConnect();
  const docs = await Party.find({
    status: { $nin: ["ended"] },
    "members.userId": userId,
  });
  let dropped = 0;
  for (const doc of docs) {
    const result = await leaveParty(String(doc._id), userId);
    if ("status" in result && result.status === 200) {
      dropped += 1;
      trackPartyEvent("party_member_dropped_offline", {
        partyId: String(doc._id),
        gameSlug: String(doc.gameSlug || "") || null,
        userId,
        reason: "disconnect",
      });
    }
  }
  return dropped;
}

/**
 * Remove party members whose presence is offline or whose heartbeat has aged
 * out. Appear-offline users keep a live heartbeat and stay in the party.
 */
export async function dropOfflinePartyMembers(now = new Date()): Promise<{ dropped: number }> {
  await dbConnect();
  const active = await Party.find({ status: { $nin: ["ended"] } });
  if (active.length === 0) return { dropped: 0 };

  const memberIds = [
    ...new Set(
      active.flatMap((doc) =>
        (doc.members || []).map((m: { userId: unknown }) => String(m.userId))
      )
    ),
  ];
  if (memberIds.length === 0) return { dropped: 0 };

  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const live = await Presence.find({
    userId: { $in: memberIds },
    status: { $ne: "offline" },
    lastHeartbeat: { $gte: cutoff },
  })
    .select("userId")
    .lean();
  const liveSet = new Set(live.map((row) => String(row.userId)));

  let dropped = 0;
  for (const doc of active) {
    const gone = (doc.members || []).filter(
      (m: { userId: unknown }) => !liveSet.has(String(m.userId))
    );
    for (const m of gone) {
      const result = await leaveParty(String(doc._id), String(m.userId));
      if ("status" in result && result.status === 200) {
        dropped += 1;
        trackPartyEvent("party_member_dropped_offline", {
          partyId: String(doc._id),
          gameSlug: String(doc.gameSlug || "") || null,
          userId: String(m.userId),
          reason: "stale_presence",
        });
      }
    }
  }
  return { dropped };
}

/* ─── remove member (4F) ─────────────────────────────────────────────────── */

export async function removeMember(
  partyId: string,
  actorId: string,
  targetId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  const rp = toRuleParty(doc.toObject());
  const check = canRemoveMember(rp, actorId, targetId);
  if (!check.ok) return { error: check.reason || "Cannot remove", status: 403 };

  const now = new Date();
  doc.members = doc.members.filter(
    (m: { userId: unknown }) => String(m.userId) !== targetId
  );
  doc.lastActivity = now;

  const newRp = toRuleParty(doc.toObject());
  doc.status = derivePartyStatus(doc.status as PartyStatus, newRp.members);
  await doc.save();
  await setPresenceParty(targetId, { partyId: null });

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── transfer leadership (4F) ───────────────────────────────────────────── */

export async function transferLeadership(
  partyId: string,
  currentLeaderId: string,
  newLeaderId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  if (String(doc.leaderId) !== currentLeaderId) {
    return { error: "Only the current leader can transfer leadership", status: 403 };
  }

  const targetMember = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === newLeaderId
  );
  if (!targetMember) {
    return { error: "New leader must be a party member", status: 400 };
  }

  const now = new Date();
  // Demote current leader.
  const oldLeaderMember = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === currentLeaderId
  );
  if (oldLeaderMember) oldLeaderMember.role = "member";

  // Promote new leader.
  targetMember.role = "leader";
  doc.leaderId = newLeaderId;
  doc.lastActivity = now;
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── game (picked after create) ─────────────────────────────────────────── */

export async function setPartyGame(
  partyId: string,
  leaderId: string,
  gameSlug: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const slug = gameSlug.trim();
  const game = slug ? await getGame(slug, { includeTesting: true }) : null;
  if (!game) return { error: "Game not found", status: 404 };

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change the game", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }

  /*
   * Switching games mid-session is the normal way a party moves on: play one
   * game, finish, pick another. That means winding the party back to forming —
   * the old dedicated server is released so it is not left running for a game
   * nobody is in, and everyone re-readies for the new pick rather than being
   * carried into it by a stale ready flag.
   */
  const previousSlug = String(doc.gameSlug || "");
  const switchingGame = previousSlug !== slug;
  const wasInSession = doc.status === "playing" || doc.status === "launching";

  if (switchingGame && (wasInSession || doc.hosted?.roomId)) {
    await releasePartyHost(doc);
    await releasePartyLan(doc);
  }
  if (switchingGame && wasInSession) {
    doc.status = "forming";
    for (const member of doc.members) member.ready = false;
  }

  doc.gameSlug = slug;
  if (switchingGame) {
    doc.editionSlug = null;
    doc.modSlugs = [];
    resetPartyConnectState(doc);
  }
  doc.lastActivity = new Date();
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  await Promise.all(
    memberIds.map((userId) =>
      setPresenceParty(userId, { partyId: String(doc._id), gameSlug: slug })
    )
  );
  const nameById = await resolveUsernames(memberIds);

  let updated = serializeParty(doc.toObject(), nameById, game.title);
  trackPartyEvent("party_game_set", {
    partyId: updated.id,
    gameSlug: slug,
    userId: leaderId,
  });
  if (updated.gameSlug) {
    const sync = await checkConfigSync(updated.id);
    if (!("error" in sync)) {
      updated = { ...updated, configSync: sync.sync };
      if (!sync.sync.allReady) {
        trackPartyEvent("party_config_sync", {
          partyId: updated.id,
          gameSlug: slug,
          userId: leaderId,
          allReady: false,
          missing: sync.sync.members.filter((m) => !m.hasGame).map((m) => m.userId),
        });
      }
    }
  }
  return {
    party: updated,
    status: 200,
  };
}

export async function setPartyEdition(
  partyId: string,
  leaderId: string,
  editionSlug: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change the edition", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }
  if (!doc.gameSlug) {
    return { error: "Pick a game first", status: 400 };
  }

  const game = await getGame(String(doc.gameSlug), { includeTesting: true });
  if (!game) return { error: "Game not found", status: 404 };

  const slug = typeof editionSlug === "string" ? editionSlug.trim() : "";
  if (slug) {
    const editions = await listEditionsForGame(game);
    if (!editions.some((edition) => edition.slug === slug)) {
      return { error: "Edition not found", status: 404 };
    }
  }

  doc.editionSlug = slug || null;
  doc.lastActivity = new Date();
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const nameById = await resolveUsernames(memberIds);

  trackPartyEvent("party_edition_set", {
    partyId: String(doc._id),
    gameSlug: String(doc.gameSlug || "") || null,
    editionSlug: slug || null,
    userId: leaderId,
  });
  const serialized = serializeParty(doc.toObject(), nameById, game.title);
  return {
    party: await attachConfigSync(serialized, leaderId),
    status: 200,
  };
}

export async function setPartyName(
  partyId: string,
  leaderId: string,
  name: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can rename the party", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }

  doc.name = normalizePartyName(name);
  doc.lastActivity = new Date();
  await doc.save();
  if (doc.discord?.voiceChannelId) {
    await renamePartyDiscordVoice(doc, doc.name);
  }

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    doc.gameSlug ? getGame(doc.gameSlug, { includeTesting: true }) : null,
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── visibility (4F) ────────────────────────────────────────────────────── */

export async function setVisibility(
  partyId: string,
  leaderId: string,
  visibility: PartyVisibility
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change visibility", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }

  doc.visibility = visibility;
  doc.lastActivity = new Date();
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── ready toggle (4G) ──────────────────────────────────────────────────── */

export async function setReady(
  partyId: string,
  userId: string,
  ready: boolean
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (!doc.gameSlug) {
    return { error: "Pick a game before ready-up", status: 400 };
  }
  if (doc.status === "ended" || doc.status === "launching" || doc.status === "playing") {
    return { error: "Cannot change ready state now", status: 400 };
  }

  const member = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === userId
  );
  if (!member) return { error: "Not in this party", status: 400 };

  member.ready = ready;
  doc.lastActivity = new Date();

  // Auto-derive status: forming ↔ ready.
  const rp = toRuleParty(doc.toObject());
  doc.status = derivePartyStatus(doc.status as PartyStatus, rp.members);

  await doc.save();
  await maybeProvisionPartyConnect(doc);

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── join game (individual, including solo) ─────────────────────────────── */

export async function joinPartyGame(
  partyId: string,
  userId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };
  if (!doc.gameSlug) {
    return { error: "Pick a game before joining", status: 400 };
  }

  const member = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === userId
  );
  if (!member) return { error: "Not in this party", status: 403 };
  if (!member.ready && doc.status !== "playing" && doc.status !== "launching") {
    return { error: "Ready up before joining the game", status: 400 };
  }

  const firstLaunch = doc.status !== "playing" && doc.status !== "launching";
  const connect = await ensurePartyConnectReady(doc);
  if ("error" in connect) {
    return { error: connect.error, status: 400 };
  }
  if (firstLaunch) {
    doc.status = "playing";
    doc.lastActivity = new Date();
    await doc.save();
    await placePartyDiscordVoice(doc);
  } else if (doc.discord?.voiceChannelId && !doc.discord.relocatedAt) {
    await placePartyDiscordVoice(doc);
  }

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  const joined = serializeParty(doc.toObject(), nameById, game?.title || null);
  trackPartyEvent("party_join_game", {
    partyId: joined.id,
    gameSlug: joined.gameSlug || null,
    userId,
    firstLaunch,
    hostedStatus: joined.hosted?.status || null,
    host: joined.hosted?.host || null,
    port: joined.hosted?.port || null,
  });
  return {
    party: joined,
    status: 200,
  };
}

/** True when any member's live presence still shows them in this party's game. */
async function anyMemberStillPlayingPartyGame(
  doc: { gameSlug?: string | null; members: Array<{ userId: unknown }> },
  now = Date.now()
): Promise<boolean> {
  const gameSlug = String(doc.gameSlug || "");
  if (!gameSlug) return false;
  const memberIds = doc.members.map((m) => m.userId);
  if (!memberIds.length) return false;

  const presences = await Presence.find({ userId: { $in: memberIds } }).lean();
  return presences.some((p) => {
    const fresh = applyPresenceFreshness(
      {
        status: p.status,
        lastHeartbeat: p.lastHeartbeat,
        currentGameId: p.currentGameId,
      },
      now
    );
    return fresh.status === "playing" && String(fresh.currentGameId || "") === gameSlug;
  });
}

/**
 * Wind a party back out of playing/launching once nobody is in the game anymore.
 *
 * Party join marks `playing` on the server; without this, closing the game
 * locally left "Session in progress" forever because nothing cleared it.
 */
async function tryEndPartySession(doc: PartyDoc): Promise<boolean> {
  if (doc.status !== "playing" && doc.status !== "launching") return false;
  if (await anyMemberStillPlayingPartyGame(doc)) return false;

  await releasePartyHost(doc);
  await releasePartyLan(doc);

  const rp = toRuleParty(doc.toObject());
  doc.status = derivePartyStatus("forming", rp.members);
  doc.lastActivity = new Date();
  await doc.save();

  trackPartyEvent("party_session_ended", {
    partyId: String(doc._id),
    gameSlug: String(doc.gameSlug || "") || null,
  });
  return true;
}

export async function exitPartyGame(
  partyId: string,
  userId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };

  const member = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === userId
  );
  if (!member) return { error: "Not in this party", status: 403 };

  await tryEndPartySession(doc);

  const refreshed = await Party.findById(partyId);
  if (!refreshed) return { error: "Party not found", status: 404 };

  const memberIds: string[] = refreshed.members.map((m: { userId: unknown }) =>
    String(m.userId)
  );
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    refreshed.gameSlug
      ? getGame(String(refreshed.gameSlug), { includeTesting: true })
      : Promise.resolve(null),
  ]);

  return {
    party: serializeParty(refreshed.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

export async function launchParty(
  partyId: string,
  leaderId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (!doc.gameSlug) {
    return { error: "Pick a game before launching", status: 400 };
  }

  const rp = toRuleParty(doc.toObject());
  const check = canLaunch(rp, leaderId);
  if (!check.ok) return { error: check.reason || "Cannot launch", status: 403 };

  const connect = await ensurePartyConnectReady(doc as unknown as PartyDoc);
  if ("error" in connect) {
    return { error: connect.error, status: 400 };
  }

  const now = new Date();
  doc.status = "playing";
  doc.lastActivity = now;
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  const launched = serializeParty(doc.toObject(), nameById, game?.title || null);
  trackPartyEvent("party_join_game", {
    partyId: launched.id,
    gameSlug: launched.gameSlug || null,
    userId: leaderId,
    firstLaunch: true,
    via: "launch",
    hostedStatus: launched.hosted?.status || null,
    host: launched.hosted?.host || null,
    port: launched.hosted?.port || null,
  });
  return {
    party: launched,
    status: 200,
  };
}

export async function endParty(
  partyId: string,
  userId: string
): Promise<{ status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (doc.status === "ended") return { error: "Party already ended", status: 400 };

  if (String(doc.leaderId) !== userId) {
    return { error: "Only the leader can end the party", status: 403 };
  }

  const now = new Date();
  doc.status = "ended";
  doc.endedAt = now;
  doc.lastActivity = now;
  await releasePartyHost(doc);
  await releasePartyLan(doc);
  await doc.save();
  await clearPresenceForParty(String(doc._id));
  await cleanupPartyDiscordVoice(doc);
  trackPartyEvent("party_ended", {
    partyId: String(doc._id),
    gameSlug: String(doc.gameSlug || "") || null,
    userId,
    reason: "leader",
  });

  return { status: 200 };
}

/* ─── get party (4A) ─────────────────────────────────────────────────────── */

export async function getParty(
  partyId: string,
  viewerUserId?: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId).lean();
  if (!doc) return { error: "Party not found", status: 404 };

  const memberIds = (doc.members as Array<{ userId: unknown }>).map((m) =>
    String(m.userId)
  );
  memberIds.push(String(doc.leaderId));
  const [nameById, game] = await Promise.all([
    resolveUsernames([...new Set(memberIds)]),
    getGame(String(doc.gameSlug), { includeTesting: true }),
  ]);

  return {
    party: await attachConfigSync(
      serializeParty(doc, nameById, game?.title || null),
      viewerUserId
    ),
    status: 200,
  };
}

/* ─── list user's active parties (4P) ────────────────────────────────────── */

export async function listPartiesForUser(
  userId: string
): Promise<PartyPayload[]> {
  await dbConnect();

  const docs = await Party.find({
    "members.userId": userId,
    status: { $nin: ["ended"] },
  })
    .sort({ lastActivity: -1 })
    .limit(10)
    .lean();

  if (docs.length === 0) return [];

  const canonical = await pickCanonicalPartyDoc(docs as PartyDocLean[], userId);
  if (!canonical) return [];

  const allMemberIds = new Set<string>();
  const slugs = new Set<string>();
  for (const d of [canonical]) {
    allMemberIds.add(String(d.leaderId));
    for (const m of d.members as Array<{ userId: unknown }>) {
      allMemberIds.add(String(m.userId));
    }
    if (d.gameSlug) slugs.add(String(d.gameSlug));
  }

  const [nameById, games] = await Promise.all([
    resolveUsernames([...allMemberIds]),
    Promise.all(
      [...slugs].map(async (s) => {
        const g = await getGame(s, { includeTesting: true });
        return [s, g?.title || null] as const;
      })
    ),
  ]);
  const titleBySlug = new Map(games);

  let party = serializeParty(canonical, nameById, titleBySlug.get(String(canonical.gameSlug)) || null);
  party = await attachConfigSync(party, userId);

  const presence = await Presence.findOne({ userId }).select("currentPartyId").lean();
  const presencePartyId = presence?.currentPartyId ? String(presence.currentPartyId) : null;
  if (presencePartyId !== party.id) {
    await setPresenceParty(userId, {
      partyId: party.id,
      gameSlug: party.gameSlug || null,
    });
  }

  return [party];
}

/* ─── discover friend parties (4E) ───────────────────────────────────────── */

export async function listDiscoverableParties(
  userId: string
): Promise<PartyPayload[]> {
  await dbConnect();

  const friendIds = await acceptedFriendIds(userId);
  if (friendIds.length === 0) return [];

  // Parties where a friend is a member, visibility is "friends", and
  // the requesting user is not already in them.
  const docs = await Party.find({
    "members.userId": { $in: friendIds, $nin: [userId] },
    visibility: "friends",
    status: { $nin: ["ended"] },
  })
    .sort({ lastActivity: -1 })
    .limit(20)
    .lean();

  // Filter out parties the user is already in (double-check since
  // the $nin on embedded arrays can be tricky).
  const filtered = docs.filter(
    (d) =>
      !(d.members as Array<{ userId: unknown }>).some(
        (m) => String(m.userId) === userId
      )
  );

  if (filtered.length === 0) return [];

  const allMemberIds = new Set<string>();
  const slugs = new Set<string>();
  for (const d of filtered) {
    allMemberIds.add(String(d.leaderId));
    for (const m of d.members as Array<{ userId: unknown }>) {
      allMemberIds.add(String(m.userId));
    }
    if (d.gameSlug) slugs.add(String(d.gameSlug));
  }

  const [nameById, games] = await Promise.all([
    resolveUsernames([...allMemberIds]),
    Promise.all(
      [...slugs].map(async (s) => {
        const g = await getGame(s, { includeTesting: true });
        return [s, g?.title || null] as const;
      })
    ),
  ]);
  const titleBySlug = new Map(games);

  return filtered.map((d) =>
    serializeParty(d, nameById, titleBySlug.get(String(d.gameSlug)) || null)
  );
}

const OPEN_PARTY_STATUSES = ["forming", "ready", "playing"] as const;

async function serializePartyDocs(
  docs: Array<Record<string, unknown>>
): Promise<PartyPayload[]> {
  if (docs.length === 0) return [];
  const allMemberIds = new Set<string>();
  const slugs = new Set<string>();
  for (const d of docs) {
    allMemberIds.add(String(d.leaderId));
    for (const m of (d.members as Array<{ userId: unknown }>) || []) {
      allMemberIds.add(String(m.userId));
    }
    if (d.gameSlug) slugs.add(String(d.gameSlug));
  }
  const [nameById, games] = await Promise.all([
    resolveUsernames([...allMemberIds]),
    Promise.all(
      [...slugs].map(async (s) => {
        const g = await getGame(s, { includeTesting: true });
        return [s, g?.title || null] as const;
      })
    ),
  ]);
  const titleBySlug = new Map(games);
  return docs.map((d) =>
    serializeParty(d, nameById, titleBySlug.get(String(d.gameSlug)) || null)
  );
}

/** Public, joinable parties — waiting for players or in-progress with space. */
export async function listOpenPublicParties(limit = 50): Promise<PartyPayload[]> {
  try {
    await dbConnect();
    const docs = await Party.find({
      visibility: "public",
      status: { $in: [...OPEN_PARTY_STATUSES] },
      gameSlug: { $nin: [null, ""] },
    })
      .sort({ lastActivity: -1 })
      .limit(Math.min(Math.max(limit, 1), 200) * 2)
      .lean();

    const open = docs.filter((d) => {
      const members = (d.members as unknown[]) || [];
      const maxSize = (d.maxSize as number) || PARTY_MAX_SIZE;
      return members.length < maxSize;
    });
    return serializePartyDocs(open.slice(0, limit) as Array<Record<string, unknown>>);
  } catch (err) {
    console.error("listOpenPublicParties failed:", err);
    return [];
  }
}

export async function countOpenPublicParties(): Promise<number> {
  try {
    await dbConnect();
    const docs = await Party.find({
      visibility: "public",
      status: { $in: [...OPEN_PARTY_STATUSES] },
      gameSlug: { $nin: [null, ""] },
    })
      .select("members maxSize")
      .lean();
    return docs.filter((d) => {
      const members = (d.members as unknown[]) || [];
      const maxSize = (d.maxSize as number) || PARTY_MAX_SIZE;
      return members.length < maxSize;
    }).length;
  } catch (err) {
    console.error("countOpenPublicParties failed:", err);
    return 0;
  }
}

/* ─── config sync (4H, 4I) ──────────────────────────────────────────────── */

export type { ConfigSyncMember, ConfigSyncResult } from "@/lib/playTogether/types";
export { BASE_EDITION_KEY, isBaseEditionSlug, libraryHasRequiredEdition } from "@/lib/playTogether/editionMatch";

export async function checkConfigSync(
  partyId: string
): Promise<{ sync: ConfigSyncResult; status: 200 } | { error: string; status: 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId).lean();
  if (!doc) return { error: "Party not found", status: 404 };

  const memberIds = (doc.members as Array<{ userId: unknown }>).map((m) =>
    String(m.userId)
  );
  const hostId = doc.leaderId ? String(doc.leaderId) : null;
  const memberObjectIds = memberIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  const memberLookup = [...new Set([...memberIds, ...memberObjectIds])];

  const [nameById, libraryEntries, modEntries, presences] = await Promise.all([
    resolveUsernames(memberIds),
    LibraryEntry.find({
      userId: { $in: memberLookup },
      gameSlug: doc.gameSlug,
    })
      .select("userId gameSlug editionSlug installedEditions installed")
      .lean(),
    LibraryModEntry.find({
      userId: { $in: memberLookup },
      baseGameSlug: { $in: modBaseGameSlugsForCatalogGame(String(doc.gameSlug || "")) },
      installed: true,
    })
      .select("userId modSlug")
      .lean(),
    Presence.find({
      userId: { $in: memberLookup },
      lastHeartbeat: { $gte: new Date(Date.now() - STALE_AFTER_MS) },
    })
      .select("userId currentGameId status")
      .lean(),
  ]);

  /*
   * userId → every installed edition slug, plus the default they launch.
   *
   * Reads `installedEditions` rather than the single `editionSlug`, because a
   * player can have several builds of one game and the row only ever recorded
   * one of them. That is what made config-sync tell people they were missing an
   * edition already on their disk.
   */
  const installedByUser = new Map<string, Set<string>>();
  const primaryByUser = new Map<string, string>();
  for (const entry of libraryEntries) {
    const uid = String(entry.userId);
    if (!installedByUser.has(uid)) installedByUser.set(uid, new Set());
    const editions = editionsFromRow(entry);
    for (const slug of editions) installedByUser.get(uid)!.add(slug);
    if (editions.size > 0) primaryByUser.set(uid, primaryEditionFromRow(entry));
  }

  // userId → set of installed mod slugs for this game.
  const modsByUser = new Map<string, Set<string>>();
  for (const entry of modEntries) {
    const uid = String(entry.userId);
    if (!modsByUser.has(uid)) modsByUser.set(uid, new Set());
    modsByUser.get(uid)!.add(String(entry.modSlug));
  }

  /*
   * The host's actual install is the reference, not the party's declared
   * fields. Someone who picks a game and launches a heavily modded copy of it
   * is what everyone else has to match; the declared editionSlug is only a
   * label and is frequently empty.
   *
   * When the host has nothing installed there is nothing to match, so the
   * declared fields stand in. Without that fallback a host who has not
   * installed yet would mark every other member incompatible with an empty
   * config.
   */
  const hostEditions = hostId ? installedByUser.get(hostId) : undefined;
  const hostHasGame = Boolean(hostEditions && hostEditions.size > 0);
  const referenceSource: "host" | "party" = hostHasGame ? "host" : "party";

  const declaredEdition = (doc.editionSlug as string) || null;
  const declaredMods = (doc.modSlugs as string[]) || [];

  /*
   * The host's *default* build, not whichever edition happens to sort first.
   * With several installed, an arbitrary pick would point the party at a build
   * the host is not actually launching.
   */
  const hostEdition =
    hostHasGame && hostId
      ? primaryByUser.get(hostId) ?? BASE_EDITION_KEY
      : null;

  const editionSlug = hostHasGame
    ? isBaseEditionSlug(hostEdition)
      ? null
      : hostEdition
    : declaredEdition;

  const modSlugs = hostHasGame
    ? [...(hostId ? modsByUser.get(hostId) ?? new Set<string>() : new Set<string>())].sort()
    : declaredMods;

  const playingThisGame = new Set(
    presences
      .filter((row) => {
        const status = String(row.status || "");
        if (status !== "playing") return false;
        return Boolean(doc.gameSlug) && String(row.currentGameId || "") === String(doc.gameSlug || "");
      })
      .map((row) => String(row.userId))
  );
  const currentlyPlaying = new Set(
    presences
      .filter((row) => String(row.status || "") === "playing")
      .map((row) => String(row.userId))
  );

  const members: ConfigSyncMember[] = memberIds.map((uid) => {
    const editions = installedByUser.get(uid) || new Set<string>();
    const inThisGame = playingThisGame.has(uid);
    const playing = currentlyPlaying.has(uid);
    const hasGame = editions.size > 0 || inThisGame;
    const isHost = uid === hostId;
    const theirMods = modsByUser.get(uid) || new Set<string>();
    return {
      userId: uid,
      username: nameById.get(uid) || "Player",
      hasGame,
      hasEdition: Boolean(hasGame && (inThisGame || libraryHasRequiredEdition(editions, editionSlug))),
      // Only meaningful once they have the game; otherwise the game is the ask.
      missingMods: hasGame ? modSlugs.filter((slug) => !theirMods.has(slug)) : modSlugs,
      isHost,
      playing,
      installedEditionSlug: hasGame
        ? primaryByUser.get(uid) ?? BASE_EDITION_KEY
        : null,
    };
  });

  const everyoneInSync = members.every(
    (m) => m.hasGame && m.hasEdition && m.missingMods.length === 0
  );

  return {
    sync: {
      gameSlug: String(doc.gameSlug),
      editionSlug,
      modSlugs,
      members,
      allInSync: everyoneInSync,
      // Same value, old name — see the deprecation note on ConfigSyncResult.
      allReady: everyoneInSync,
      referenceSource,
      hostUserId: hostId,
      hostUsername: hostId ? nameById.get(hostId) || "Host" : null,
    },
    status: 200,
  };
}

/* ─── sweep stale parties (cron) ─────────────────────────────────────────── */

export async function sweepStaleParties(now = new Date()) {
  await dbConnect();
  const cutoff = new Date(now.getTime() - PARTY_IDLE_TIMEOUT_MS);

  const stale = await Party.find({
    status: { $nin: ["ended"] },
    lastActivity: { $lt: cutoff },
  });

  let ended = 0;
  for (const doc of stale) {
    doc.status = "ended";
    doc.endedAt = now;
    await releasePartyHost(doc);
    await releasePartyLan(doc);
    await doc.save();
    await cleanupPartyDiscordVoice(doc);
    ended += 1;
  }

  /*
   * Parties that ended but kept their channel.
   *
   * Timing out is how most parties actually die — people close the launcher
   * rather than pressing End — and this sweep did not clean Discord up at all,
   * so those channels accumulated. The pass below also catches the explicit
   * end paths whose cleanup failed while the bot was unreachable, since
   * `cleanedAt` stays null until one actually succeeds.
   */
  const orphaned = await Party.find({
    status: "ended",
    "discord.cleanedAt": null,
    $or: [
      { "discord.voiceChannelId": { $nin: [null, ""] } },
      { "discord.textChannelId": { $nin: [null, ""] } },
    ],
  }).limit(200);

  let channelsCleaned = 0;
  for (const doc of orphaned) {
    if (await cleanupPartyDiscordVoice(doc)) channelsCleaned += 1;
  }

  // Clean up chat messages older than 24 hours for ended/orphaned parties
  const { deleted: messagesDeleted } = await sweepOldPartyMessages();

  return { ended, channelsCleaned, messagesDeleted };
}

/**
 * Deletes chat messages older than 24 hours for ended parties or orphaned records,
 * while strictly preserving all messages for active/in-progress parties.
 */
export async function sweepOldPartyMessages(olderThanMs = 24 * 60 * 60 * 1000) {
  await dbConnect();
  const cutoff = new Date(Date.now() - olderThanMs);

  // 1. Gather all active party IDs to guarantee they are never touched
  const activeParties = await Party.find({
    status: { $ne: "ended" },
  })
    .select("_id")
    .lean();
  const activePartyIds = activeParties.map((p) => p._id);

  // 2. Delete messages created > 24 hours ago that belong to ended parties or deleted parties
  const res = await PartyMessage.deleteMany({
    createdAt: { $lt: cutoff },
    partyId: { $nin: activePartyIds },
  });

  return { deleted: res.deletedCount || 0 };
}

/* ─── legacy stubs (backward compat for Phase 3 tests) ───────────────────── */

/** @deprecated Phase 3 stub — use createParty instead. */
export function getPartyCapability(): {
  supported: boolean;
  reason: string;
} {
  return {
    supported: true,
    reason: "Party system is available",
  };
}

/** @deprecated Phase 3 stub type — use PartyPayload instead. */
export type PartyPhase =
  | "idle"
  | "selecting_friends"
  | "creating_discord_room"
  | "awaiting_joins"
  | "launching"
  | "active"
  | "ended";

/** @deprecated Phase 3 stub type — use createParty opts instead. */
export type PartyIntent = {
  hostUserId: string;
  memberUserIds: string[];
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
};
