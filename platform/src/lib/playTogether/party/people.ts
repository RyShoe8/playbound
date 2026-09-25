/** Membership bookkeeping: friends, usernames, the one-active-party rule and the leader's seat. */
import { Types } from "mongoose";
import Party from "@/lib/models/Party";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import Presence from "@/lib/models/Presence";
import ActivePartyMembership from "@/lib/models/ActivePartyMembership";
import { PARTY_MAX_SIZE, PARTY_IDLE_TIMEOUT_MS, type PartyStatus, type PartyVisibility } from "@/lib/playTogether/types";
import { type PartyVoiceFollowup } from "@/lib/playTogether/discordPartyProvision";
import { type RuleParty, type RuleMember } from "@/lib/playTogether/partyRules";
import { leaveParty } from "./membership";

/* ─── helpers ────────────────────────────────────────────────────────────── */

export async function acceptedFriendIds(userId: string): Promise<string[]> {
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const userOr = userObjId
    ? [{ requesterId: userObjId }, { recipientId: userObjId }, { requesterId: userId }, { recipientId: userId }]
    : [{ requesterId: userId }, { recipientId: userId }];
  const docs = await Friend.find({
    status: "accepted",
    $or: userOr,
  })
    .select("requesterId recipientId")
    .lean();
  return docs.map((f) => {
    const a = String(f.requesterId);
    const b = String(f.recipientId);
    return a === userId ? b : a;
  });
}

export function toRuleParty(doc: Record<string, unknown>): RuleParty {
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
    eventId: doc.eventId ? String(doc.eventId) : null,
  };
}

export async function resolveUsernames(
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

/**
 * Everything a party payload needs to know about its people, in two reads.
 *
 * `osById` is which OS each member is actually on, from presence. The party's
 * game list has to be playable by everyone in it — a Windows-only game is not
 * a real option for a party with someone on Linux, and picking one strands
 * them at "not available for your platform" after the party has already
 * committed to it. A member with no live presence row reports "unknown", and
 * callers treat that as "do not constrain": someone who has not opened the
 * launcher yet should not silently narrow everyone else's choices.
 *
 * `partyIdById` comes free from the same presence read, so the list path can
 * check whether presence still points at the right party without a third
 * query on every poll.
 */
export type PartyPeople = {
  nameById: Map<string, string>;
  osById: Map<string, string>;
  partyIdById: Map<string, string | null>;
};

const EMPTY_PEOPLE: PartyPeople = {
  nameById: new Map(),
  osById: new Map(),
  partyIdById: new Map(),
};

export async function resolvePartyPeople(ids: string[]): Promise<PartyPeople> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return EMPTY_PEOPLE;

  const [users, rows] = await Promise.all([
    User.find({ _id: { $in: unique } })
      .select("username")
      .lean(),
    Presence.find({ userId: { $in: unique } })
      .select("userId os lastSeenAt currentPartyId")
      .sort({ lastSeenAt: -1 })
      .lean(),
  ]);

  const nameById = new Map(
    users.map((u) => [String(u._id), String(u.username || "Player")])
  );
  const osById = new Map<string, string>();
  const partyIdById = new Map<string, string | null>();
  for (const row of rows) {
    const key = String((row as { userId: unknown }).userId);
    // Sorted newest first, so the first row for a user is their current device.
    if (osById.has(key)) continue;
    osById.set(key, String((row as { os?: unknown }).os || "unknown"));
    const currentPartyId = (row as { currentPartyId?: unknown }).currentPartyId;
    partyIdById.set(key, currentPartyId ? String(currentPartyId) : null);
  }
  return { nameById, osById, partyIdById };
}

export const SKIP_VOICE: PartyVoiceFollowup = {
  needsDiscordLink: false,
  inviteUrl: null,
  moved: false,
  inPartyVoice: false,
};

export function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function reserveActiveMembership(
  userId: string,
  partyId: string,
  retryStale = true
): Promise<"claimed" | "existing" | "conflict"> {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(partyId)) {
    return "conflict";
  }
  try {
    const result = await ActivePartyMembership.updateOne(
      { userId: new Types.ObjectId(userId), partyId: new Types.ObjectId(partyId) },
      {
        $setOnInsert: {
          userId: new Types.ObjectId(userId),
          partyId: new Types.ObjectId(partyId),
        },
      },
      { upsert: true }
    );
    return result.upsertedCount ? "claimed" : "existing";
  } catch (err) {
    if (isMongoDuplicateKey(err)) {
      const existing = await ActivePartyMembership.findOne({
        userId: new Types.ObjectId(userId),
      }).lean();
      if (String(existing?.partyId || "") === partyId) return "existing";
      if (existing && retryStale) {
        const liveParty = await Party.exists({
          _id: existing.partyId,
          status: { $nin: ["ended"] },
          "members.userId": new Types.ObjectId(userId),
        });
        if (!liveParty) {
          await ActivePartyMembership.deleteOne({
            _id: existing._id,
            partyId: existing.partyId,
          });
          return reserveActiveMembership(userId, partyId, false);
        }
      }
      return "conflict";
    }
    throw err;
  }
}

export async function releaseActiveMembership(userId: string, partyId: string): Promise<void> {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(partyId)) return;
  await ActivePartyMembership.deleteOne({
    userId: new Types.ObjectId(userId),
    partyId: new Types.ObjectId(partyId),
  });
}

export async function releasePartyMemberships(partyId: string): Promise<void> {
  if (!Types.ObjectId.isValid(partyId)) return;
  await ActivePartyMembership.deleteMany({ partyId: new Types.ObjectId(partyId) });
}

export async function findActiveLeaderParty(userId: string) {
  const cutoff = new Date(Date.now() - PARTY_IDLE_TIMEOUT_MS);
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const matchUser = userObjId ? { $in: [userId, userObjId] } : userId;
  return Party.findOne({
    leaderId: matchUser,
    status: { $nin: ["ended"] },
    lastActivity: { $gte: cutoff },
  }).lean();
}

/** Active parties this user leads or belongs to — used for cleanup and listing. */
export function activePartyFilterForUser(userId: string, keepPartyId?: string) {
  const cutoff = new Date(Date.now() - PARTY_IDLE_TIMEOUT_MS);
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const matchUser = userObjId ? { $in: [userId, userObjId] } : userId;
  const base: Record<string, unknown> = {
    status: { $nin: ["ended"] },
    lastActivity: { $gte: cutoff },
    $and: [{ $or: [{ leaderId: matchUser }, { "members.userId": matchUser }] }],
  };
  if (keepPartyId) {
    const keepObjId = Types.ObjectId.isValid(keepPartyId) ? new Types.ObjectId(keepPartyId) : null;
    base._id = keepObjId ? { $nin: [keepPartyId, keepObjId] } : { $ne: keepPartyId };
  }
  return base;
}

/** Leave failures during cleanup must not block create/list. */
export async function safeLeaveParty(partyId: string, userId: string): Promise<void> {
  try {
    const result = await leaveParty(partyId, userId);
    if ("error" in result) {
      console.warn(`[party] safe leave ${partyId} for ${userId}: ${result.error}`);
    }
  } catch (err) {
    console.warn(
      `[party] safe leave ${partyId} for ${userId} threw:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Drop every live party except `keepPartyId` — one active membership per user. */
export async function leaveOtherActiveParties(userId: string, keepPartyId?: string) {
  const docs = await Party.find(activePartyFilterForUser(userId, keepPartyId));
  for (const doc of docs) {
    await safeLeaveParty(String(doc._id), userId);
  }
}

/** Leader-only rows missing from the roster break list queries; heal in place. */
export async function ensureLeaderMembership(doc: { _id: unknown; leaderId: unknown; members: Array<{ userId: unknown; role?: string; ready?: boolean; joinedAt?: Date }> }) {
  const leaderId = String(doc.leaderId);
  const inMembers = doc.members.some((m) => String(m.userId) === leaderId);
  if (inMembers) return doc;
  doc.members.unshift({
    userId: doc.leaderId,
    role: "leader",
    ready: false,
    joinedAt: new Date(),
  });
  await Party.updateOne({ _id: doc._id }, { $set: { members: doc.members } });
  return doc;
}

export type PartyDocLean = Record<string, unknown> & {
  _id: unknown;
  lastActivity?: Date;
};

/** One canonical party when legacy rows still have the user in multiple rosters. */
export async function pickCanonicalPartyDoc(
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
      await safeLeaveParty(String(d._id), userId);
    }
  }
  return canonical;
}
