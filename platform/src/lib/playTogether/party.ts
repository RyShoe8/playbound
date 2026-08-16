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
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { getGame } from "@/lib/catalog";
import {
  PARTY_MAX_SIZE,
  PARTY_IDLE_TIMEOUT_MS,
  type PartyStatus,
  type PartyVisibility,
  type PartyPayload,
  type PartyMemberPayload,
  normalizePartyName,
} from "@/lib/playTogether/types";
import { setPresenceParty, clearPresenceForParty } from "@/lib/presence/server";
import {
  cleanupPartyDiscordVoice,
  placePartyDiscordVoice,
  renamePartyDiscordVoice,
  syncPartyVoiceForMember,
  type PartyVoiceFollowup,
} from "@/lib/playTogether/discordPartyProvision";
import {
  hostedPayloadFromDoc,
  provisionPartyHost,
  releasePartyHost,
} from "@/lib/gameHost/provision";
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
      inviteUrl: (discord.inviteUrl as string) || null,
    },
    hosted: hostedPayloadFromDoc(
      String(doc.gameSlug || ""),
      (doc.hosted as Parameters<typeof hostedPayloadFromDoc>[1]) || null
    ),
    lastActivity: (doc.lastActivity as Date)?.toISOString() || new Date().toISOString(),
    createdAt: (doc.createdAt as Date)?.toISOString() || new Date().toISOString(),
  };
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
  | ({ party: PartyPayload; status: 201 } & PartyVoiceFollowup)
  | { error: string; status: 400 | 409 | 404 }
> {
  await dbConnect();

  const gameSlug = typeof opts.gameSlug === "string" ? opts.gameSlug.trim() : "";
  const game = gameSlug ? await getGame(gameSlug, { includeTesting: true }) : null;
  if (gameSlug && !game) return { error: "Game not found", status: 404 };

  // One active party per leader.
  const existing = await Party.findOne({
    leaderId: opts.userId,
    status: { $nin: ["ended"] },
  }).lean();
  if (existing) {
    return { error: "You already have an active party", status: 409 };
  }

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
  const doc = await Party.create({
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

  await setPresenceParty(opts.userId, {
    partyId: String(doc._id),
    gameSlug: gameSlug || null,
  });
  if (gameSlug) await provisionPartyHost(doc);
  const nameById = await resolveUsernames([opts.userId]);
  return {
    party: serializeParty(
      doc.toObject ? doc.toObject() : doc,
      nameById,
      game?.title || null
    ),
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

  const doc = await Party.findById(partyId);
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

  const check = canJoinParty(rp, userId, isFriend, passwordOk);
  if (!check.ok) return { error: check.reason || "Cannot join", status: 403 };

  const now = new Date();
  doc.members.push({
    userId,
    role: "member",
    ready: false,
    joinedAt: now,
  });
  doc.lastActivity = now;

  // Re-derive status (e.g., if everyone was ready and a new unready member joined).
  const newRp = toRuleParty(doc.toObject());
  doc.status = derivePartyStatus(doc.status as PartyStatus, newRp.members);

  await doc.save();

  await setPresenceParty(userId, { partyId: String(doc._id), gameSlug: String(doc.gameSlug) });
  const voice =
    doc.voiceEnabled === false ? SKIP_VOICE : await syncPartyVoiceForMember(doc, userId);

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const [nameById, game] = await Promise.all([
    resolveUsernames(memberIds),
    getGame(doc.gameSlug, { includeTesting: true }),
  ]);

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
    ...voice,
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
      await doc.save();
      await setPresenceParty(userId, { partyId: null });
      await clearPresenceForParty(String(doc._id));
      void cleanupPartyDiscordVoice(doc);
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
  }
  await doc.save();
  await setPresenceParty(userId, { partyId: null });
  if (doc.status === "ended") {
    await clearPresenceForParty(String(doc._id));
    void cleanupPartyDiscordVoice(doc);
  }

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
  if (doc.status === "ended" || doc.status === "launching" || doc.status === "playing") {
    return { error: "Cannot change the game now", status: 400 };
  }

  doc.gameSlug = slug;
  doc.lastActivity = new Date();
  await doc.save();
  await provisionPartyHost(doc);

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  await Promise.all(
    memberIds.map((userId) =>
      setPresenceParty(userId, { partyId: String(doc._id), gameSlug: slug })
    )
  );
  const nameById = await resolveUsernames(memberIds);

  return {
    party: serializeParty(doc.toObject(), nameById, game.title),
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
  if (firstLaunch) {
    await provisionPartyHost(doc);
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

  return {
    party: serializeParty(doc.toObject(), nameById, game?.title || null),
    status: 200,
  };
}

/* ─── launch (4B, 4G) ────────────────────────────────────────────────────── */

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

  const now = new Date();
  await provisionPartyHost(doc);
  doc.status = "playing";
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

/* ─── end party (4F) ─────────────────────────────────────────────────────── */

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
  await doc.save();
  await clearPresenceForParty(String(doc._id));
  void cleanupPartyDiscordVoice(doc);

  return { status: 200 };
}

/* ─── get party (4A) ─────────────────────────────────────────────────────── */

export async function getParty(
  partyId: string
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
    party: serializeParty(doc, nameById, game?.title || null),
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

  const allMemberIds = new Set<string>();
  const slugs = new Set<string>();
  for (const d of docs) {
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

  return docs.map((d) =>
    serializeParty(d, nameById, titleBySlug.get(String(d.gameSlug)) || null)
  );
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

export type ConfigSyncMember = {
  userId: string;
  username: string;
  hasGame: boolean;
  hasEdition: boolean;
  missingMods: string[];
};

export type ConfigSyncResult = {
  gameSlug: string;
  editionSlug: string | null;
  modSlugs: string[];
  members: ConfigSyncMember[];
  allReady: boolean;
};

export async function checkConfigSync(
  partyId: string
): Promise<{ sync: ConfigSyncResult; status: 200 } | { error: string; status: 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId).lean();
  if (!doc) return { error: "Party not found", status: 404 };

  const memberIds = (doc.members as Array<{ userId: unknown }>).map((m) =>
    String(m.userId)
  );
  const [nameById, libraryEntries] = await Promise.all([
    resolveUsernames(memberIds),
    LibraryEntry.find({
      userId: { $in: memberIds },
      gameSlug: doc.gameSlug,
    })
      .select("userId gameSlug editionSlug installed")
      .lean(),
  ]);

  // Build lookup: userId → set of installed edition slugs.
  const installedByUser = new Map<string, Set<string>>();
  for (const entry of libraryEntries) {
    const uid = String(entry.userId);
    if (!installedByUser.has(uid)) installedByUser.set(uid, new Set());
    if (entry.installed) {
      installedByUser.get(uid)!.add(entry.editionSlug || "__base__");
    }
  }

  const editionSlug = (doc.editionSlug as string) || null;
  const modSlugs = (doc.modSlugs as string[]) || [];

  const members: ConfigSyncMember[] = memberIds.map((uid) => {
    const editions = installedByUser.get(uid) || new Set<string>();
    const hasGame = editions.size > 0;
    const hasEdition = editionSlug
      ? editions.has(editionSlug)
      : hasGame;
    // Mod install check is a future enhancement (requires mod library tracking).
    // For now, mark all mods as missing if the user doesn't have the game at all.
    const missingMods = hasGame ? [] : modSlugs;
    return {
      userId: uid,
      username: nameById.get(uid) || "Player",
      hasGame,
      hasEdition,
      missingMods,
    };
  });

  return {
    sync: {
      gameSlug: String(doc.gameSlug),
      editionSlug,
      modSlugs,
      members,
      allReady: members.every((m) => m.hasGame && m.hasEdition && m.missingMods.length === 0),
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
    await doc.save();
    ended += 1;
  }

  return { ended };
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
