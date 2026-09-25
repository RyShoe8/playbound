/** Create, join, leave, remove a member, transfer leadership. */
import { randomBytes } from "crypto";
import { Types } from "mongoose";
import { canUseSavedWorld } from "@/lib/savedWorlds";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Presence from "@/lib/models/Presence";
import PlayInvite from "@/lib/models/PlayInvite";
import PlatformEvent from "@/lib/models/PlatformEvent";
import EventRsvp from "@/lib/models/EventRsvp";
import { getGame } from "@/lib/catalog";
import { PARTY_MAX_SIZE, PARTY_STRUCTURAL_MAX, type PartyStatus, type PartyVisibility, type PartyPayload, normalizePartyName } from "@/lib/playTogether/types";
import { STALE_AFTER_MS } from "@/lib/presence/types";
import { trackPartyEvent } from "@/lib/playTogether/partyTelemetry";
import { setPresenceParty, clearPresenceForParty } from "@/lib/presence/server";
import { cleanupPartyDiscordVoice, type PartyVoiceFollowup } from "@/lib/playTogether/discordPartyProvision";
import { releasePartyHost } from "@/lib/gameHost/provision";
import { releasePartyLan } from "@/lib/virtualLan/provision";
import { defaultHostMode, isValidHostMode, type PartyHostMode } from "@/lib/multiplayer/hostModes";
import { getPartySlotContext } from "@/lib/entitlements/pool";
import { canSeatAnother } from "@/lib/entitlements/slots";
import { canJoinParty, canLeaveParty, canRemoveMember, nextLeader, derivePartyStatus } from "@/lib/playTogether/partyRules";
import { SKIP_VOICE, acceptedFriendIds, ensureLeaderMembership, findActiveLeaderParty, isMongoDuplicateKey, leaveOtherActiveParties, releaseActiveMembership, releasePartyMemberships, reserveActiveMembership, toRuleParty } from "./people";
import { hashPartyPassword, partyPayloadForDoc } from "./serialize";

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
  /** Where the room runs. Falls back to the game's default when unset or invalid. */
  hostMode?: string | null;
  /** SavedWorld to load; must be one the creator has played on. */
  savedWorldId?: string | null;
  /**
   * The creator's OS, from the request that opened the party. Recorded so
   * server-side party telemetry can be attributed to a platform; see the
   * `leaderOs` note on the Party schema.
   */
  leaderOs?: string | null;
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
    await reserveActiveMembership(opts.userId, existingId);
    const healed = await Party.findById(existingId);
    const existingDoc = healed
      ? ((await ensureLeaderMembership(
          healed.toObject() as Parameters<typeof ensureLeaderMembership>[0]
        )) as Record<string, unknown>)
      : (existing as Record<string, unknown>);
    try {
      await setPresenceParty(opts.userId, {
        partyId: existingId,
        gameSlug: String(existingDoc.gameSlug || "") || null,
      });
    } catch (err) {
      console.warn("[party] setPresenceParty on idempotent create failed:", err);
    }
    const party = await partyPayloadForDoc(existingDoc);
    return { party, status: 200, existing: true, ...SKIP_VOICE };
  }

  await leaveOtherActiveParties(opts.userId);

  const visibility = opts.visibility || "friends";
  if (visibility === "event") {
    if (!opts.eventId || !Types.ObjectId.isValid(opts.eventId)) {
      return { error: "A valid event is required for an event party", status: 400 };
    }
    const event = await PlatformEvent.findById(opts.eventId)
      .select("organizerId createdBy status")
      .lean();
    if (!event) return { error: "Event not found", status: 404 };
    const organizerId = String(event.organizerId || event.createdBy || "");
    if (organizerId !== opts.userId) {
      return { error: "Only the event organizer can create its party", status: 400 };
    }
  } else if (opts.eventId) {
    return { error: "eventId is only valid for event parties", status: 400 };
  }
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

  let savedWorldId: string | null = null;
  if (opts.savedWorldId) {
    if (!gameSlug || !(await canUseSavedWorld(opts.userId, opts.savedWorldId, gameSlug))) {
      return { error: "That saved world is not available", status: 400 };
    }
    savedWorldId = opts.savedWorldId;
  }

  // The leader occupies the first seat. Joins already consult the shared
  // pool; creation must do the same or a zero/full pool can still create
  // one-person parties and their dedicated VPS rooms.
  const openingSeat = canSeatAnother(
    await getPartySlotContext({ leaderId: opts.userId, memberCount: 0, fresh: true })
  );
  if (!openingSeat.ok) return { error: openingSeat.reason || "Party slots are full", status: 400 };

  const now = new Date();
  const partyObjectId = new Types.ObjectId();
  const reservation = await reserveActiveMembership(opts.userId, String(partyObjectId));
  if (reservation === "conflict") {
    return { error: "You are already joining another party. Try again.", status: 400 };
  }
  let doc;
  try {
    doc = await Party.create({
      _id: partyObjectId,
      leaderId: opts.userId,
      members: [
        {
          userId: opts.userId,
          role: "leader",
          ready: false,
          joinedAt: now,
        },
      ],
      historicalMembers: [
        {
          userId: opts.userId,
          role: "leader",
          joinedAt: now,
          leftAt: null,
        },
      ],
      gamesPlayed: gameSlug ? [gameSlug] : [],
      savedWorldId,
      name: normalizePartyName(opts.name),
      leaderOs: opts.leaderOs || null,
      gameSlug,
      editionSlug: opts.editionSlug || null,
      modSlugs: opts.modSlugs || [],
      status: "forming",
      visibility,
      passwordSalt,
      passwordHash,
      voiceEnabled: wantVoice,
      maxSize: Math.min(Math.max(opts.maxSize || PARTY_MAX_SIZE, 2), PARTY_STRUCTURAL_MAX),
      /*
       * Validated against the game rather than trusted: a mode the game does
       * not support would otherwise provision an overlay for a room that
       * cannot use one, or skip the VPS for a game that needs it. An
       * unsupported or absent value falls back to the game's own default.
       */
      hostMode: gameSlug
        ? isValidHostMode(gameSlug, opts.hostMode)
          ? (opts.hostMode as PartyHostMode)
          : defaultHostMode(gameSlug)
        : null,
      eventId: opts.eventId || null,
      lastActivity: now,
    });
  } catch (err) {
    await releaseActiveMembership(opts.userId, String(partyObjectId));
    if (isMongoDuplicateKey(err)) {
      const raced = await findActiveLeaderParty(opts.userId);
      if (raced) {
        const racedId = String(raced._id);
        await leaveOtherActiveParties(opts.userId, racedId);
        await reserveActiveMembership(opts.userId, racedId);
        try {
          await setPresenceParty(opts.userId, {
            partyId: racedId,
            gameSlug: String(raced.gameSlug || "") || null,
          });
        } catch (presenceErr) {
          console.warn("[party] setPresenceParty on duplicate-key create failed:", presenceErr);
        }
        const party = await partyPayloadForDoc(raced as Record<string, unknown>);
        return { party, status: 200, existing: true, ...SKIP_VOICE };
      }
    }
    throw err;
  }

  const createdId = String(doc._id);
  try {
    await setPresenceParty(opts.userId, {
      partyId: createdId,
      gameSlug: gameSlug || null,
    });
  } catch (presenceErr) {
    console.warn("[party] setPresenceParty on create failed:", presenceErr);
  }

  try {
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
  } catch (payloadErr) {
    console.error("[party] create payload failed after insert:", payloadErr);
    const fallback = await findActiveLeaderParty(opts.userId);
    if (fallback) {
      const party = await partyPayloadForDoc(fallback as Record<string, unknown>);
      return { party, status: 200, existing: true, ...SKIP_VOICE };
    }
    throw payloadErr;
  }
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

  let hasInvite = false;
  if (
    doc.visibility === "invite_only" ||
    (!isFriend && doc.visibility === "friends")
  ) {
    const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    const inviteDoc = await PlayInvite.findOne({
      recipientId: userObjId ? { $in: [userId, userObjId] } : userId,
      partyId: String(doc._id),
      status: { $in: ["pending", "accepted"] },
    }).lean();
    if (inviteDoc) {
      hasInvite = true;
    }
  }

  let eventEligible = false;
  if (doc.eventId) {
    const attendee = await EventRsvp.exists({
      eventId: doc.eventId,
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
      status: "going",
    });
    const event = await PlatformEvent.findById(doc.eventId)
      .select("organizerId createdBy")
      .lean();
    eventEligible =
      Boolean(attendee) ||
      String(event?.organizerId || event?.createdBy || "") === userId;
  }

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
    const reservation = await reserveActiveMembership(userId, partyId);
    if (reservation === "conflict") {
      return { error: "You are already joining another party. Try again.", status: 400 };
    }
    await setPresenceParty(userId, { partyId: String(doc._id), gameSlug: String(doc.gameSlug) });
    return {
      party: await partyPayloadForDoc(doc.toObject()),
      status: 200,
      ...SKIP_VOICE,
    };
  }

  const check = canJoinParty(
    rp,
    userId,
    isFriend || hasInvite,
    passwordOk,
    hasInvite,
    eventEligible
  );
  if (!check.ok) return { error: check.reason || "Cannot join", status: 403 };

  /*
   * The party's own maxSize is what the host asked for; the pool is what the
   * platform can actually fund. Both have to allow the join, and this is the
   * second one — checked here rather than in canJoinParty because it needs the
   * database and those rules are pure.
   *
   * Not raced to zero deliberately: the atomic push below cannot also test the
   * pool, so two simultaneous joins can take the last slot together. One seat
   * of overshoot on a soft budget is not worth a lock, and the next join is
   * refused because usage is recomputed from the parties themselves.
   */
  const seat = canSeatAnother(
    await getPartySlotContext({ leaderId: rp.leaderId, memberCount: rp.members.length, fresh: true })
  );
  if (!seat.ok) return { error: seat.reason || "Party is full", status: 403 };

  const now = new Date();
  const reservation = await reserveActiveMembership(userId, partyId);
  if (reservation === "conflict") {
    return { error: "You are already joining another party. Try again.", status: 400 };
  }

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
  const userIdObj = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const claimed = await Party.updateOne(
    {
      _id: doc._id,
      status: { $nin: ["ended", "launching", "playing"] },
      "members.userId": { $nin: userIdObj ? [userId, userIdObj] : [userId] },
      $expr: { $lt: [{ $size: "$members" }, "$maxSize"] },
    },
    {
      $push: {
        members: { userId: userIdObj || userId, role: "member", ready: false, joinedAt: now },
        historicalMembers: { userId: userIdObj || userId, role: "member", joinedAt: now, leftAt: null },
      },
      $set: { lastActivity: now },
    }
  );

  /*
   * Losing that race is not an error. The user asked to be in this party and
   * they are, so the second click returns the party rather than a failure —
   * anything else would surface a scary message for a duplicate click.
   */
  const refreshed = await Party.findById(partyId);
  if (!refreshed) {
    if (reservation === "claimed") await releaseActiveMembership(userId, partyId);
    return { error: "Party not found", status: 404 };
  }
  if (!claimed.modifiedCount) {
    const joined = refreshed.members.some(
      (member: { userId: unknown }) => String(member.userId) === userId
    );
    if (!joined) {
      if (reservation === "claimed") await releaseActiveMembership(userId, partyId);
      return {
        error:
          refreshed.status === "ended" ||
          refreshed.status === "launching" ||
          refreshed.status === "playing"
            ? "Party is not accepting members"
            : "Party is full",
        status: 403,
      };
    }
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

  const party = await partyPayloadForDoc(doc.toObject());
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
): Promise<{ party: null; status: 200 } | { error: string; status: 400 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  const rp = toRuleParty(doc.toObject());
  const check = canLeaveParty(rp, userId);
  if (!check.ok) {
    /*
     * Already ended — treat as success so a stuck client can clear itself.
     * Membership may already be gone from a prior half-finished leave.
     */
    if (doc.status === "ended" || check.reason === "Party has already ended") {
      try {
        await releaseActiveMembership(userId, partyId);
        await setPresenceParty(userId, { partyId: null });
      } catch (err) {
        console.warn(
          `[party] leave cleanup for ended party ${partyId}:`,
          err instanceof Error ? err.message : err
        );
      }
      return { party: null, status: 200 };
    }
    return { error: check.reason || "Cannot leave", status: 400 };
  }

  const newLeaderId = rp.leaderId === userId ? nextLeader(rp.members, userId) : rp.leaderId;
  const wasPlaying = doc.status === "launching" || doc.status === "playing";
  if (rp.leaderId === userId && wasPlaying) {
    // If the host leaves during a match, release host and LAN allocations
    await releasePartyHost(doc);
    await releasePartyLan(doc);
  }

  const remaining = (doc.members || []).filter(
    (m: { userId: unknown }) => String(m.userId) !== userId
  );
  for (const m of remaining as Array<{ userId: unknown; role?: string }>) {
    m.role = newLeaderId && String(m.userId) === newLeaderId ? "leader" : "member";
  }
  doc.members = remaining as typeof doc.members;
  if (newLeaderId) {
    doc.leaderId = new Types.ObjectId(newLeaderId);
  }
  const now = new Date();
  doc.lastActivity = now;
  if (Array.isArray(doc.historicalMembers)) {
    for (let i = doc.historicalMembers.length - 1; i >= 0; i--) {
      const hm = doc.historicalMembers[i];
      if (String(hm.userId) === userId && !hm.leftAt) {
        hm.leftAt = now;
        break;
      }
    }
  }

  if (remaining.length === 0) {
    doc.status = "ended";
    doc.endedAt = now;
    if (Array.isArray(doc.historicalMembers)) {
      for (const hm of doc.historicalMembers) {
        if (!hm.leftAt) hm.leftAt = now;
      }
    }
    // Clear invalid-in-flight host states so save() cannot fail schema validation
    // on a dying party (e.g. a stale status from a prior half-finished release).
    if (doc.hosted) {
      const hs = String(doc.hosted.status || "none");
      if (!["none", "pending", "ready", "failed", "release-pending"].includes(hs)) {
        doc.hosted.status = "none";
      }
    }
  } else {
    doc.status = remaining.every((m: { ready?: boolean }) => Boolean(m.ready))
      ? "ready"
      : "forming";
  }

  try {
    await doc.save();
  } catch (err) {
    console.error(`[party] leave save failed for ${partyId}:`, err);
    throw err;
  }

  try {
    await releaseActiveMembership(userId, partyId);
    await setPresenceParty(userId, { partyId: null });
  } catch (err) {
    console.warn(
      `[party] leave presence cleanup failed for ${partyId}:`,
      err instanceof Error ? err.message : err
    );
  }

  if (doc.status === "ended") {
    /*
     * Membership is already committed. Host/LAN/Discord cleanup must not turn
     * a successful leave into a 500 — e.g. hosted.status "release-pending"
     * used to fail schema validation on save.
     */
    try {
      await releasePartyHost(doc);
      await releasePartyLan(doc);
      await doc.save();
      await releasePartyMemberships(partyId);
      await clearPresenceForParty(String(doc._id));
      await cleanupPartyDiscordVoice(doc);
    } catch (err) {
      console.warn(
        `[party] leave cleanup failed for ${partyId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const gameSlug = String(doc.gameSlug || "") || null;
  trackPartyEvent("party_left", {
    partyId: String(doc._id),
    gameSlug,
    userId,
    ended: doc.status === "ended",
  });
  if (doc.status === "ended") {
    trackPartyEvent("party_ended", {
      partyId: String(doc._id),
      gameSlug,
      userId,
      reason: "empty",
    });
  }
  return { party: null, status: 200 };
}

/**
 * Remove party members whose presence is offline or whose heartbeat has aged
 * out. Appear-offline users keep a live heartbeat and stay in the party.
 *
 * A party that is mid-session is left alone, and that exclusion is the point.
 * The heartbeat runs every 60s against a 2-minute staleness window, so two
 * missed beats is enough to be judged gone — and the likeliest time to miss two
 * is while a game is running and the launcher is behind a fullscreen window
 * doing nothing else. Dropping members then removed everyone from a party
 * whose players were, demonstrably, playing: a twenty-minute match ended with
 * the party gone rather than waiting for them to come back to it.
 *
 * Being in a game is the strongest evidence of presence there is, and it is
 * evidence this sweep already had. sweepStaleParties remains the backstop for a
 * machine that genuinely dies mid-match, but it now decides on the same
 * evidence: it ends a party once every member's heartbeat has gone, rather
 * than once fifteen minutes have passed without a party mutation. Deferring to
 * it was right; what it measured was not.
 */
export async function dropOfflinePartyMembers(now = new Date()): Promise<{ dropped: number }> {
  await dbConnect();
  const active = await Party.find({ status: { $nin: ["ended"] } });
  if (active.length === 0) return { dropped: 0 };

  const memberIds = [
    ...new Set(
      active.flatMap((doc) => [
        String(doc.leaderId),
        ...(doc.members || []).map((m: { userId: unknown }) => String(m.userId)),
      ])
    ),
  ];
  if (memberIds.length === 0) return { dropped: 0 };

  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  /*
   * Installing can block the launcher event loop longer than two missed beats
   * (large downloads, extract). Dropping the host mid-install ended the party
   * for everyone else until they came back to Friends. Keep installers alive
   * for a longer window as long as they still report status "installing".
   */
  const installingCutoff = new Date(now.getTime() - 20 * 60 * 1000);
  const live = await Presence.find({
    userId: { $in: memberIds },
    status: { $ne: "offline" },
    $or: [
      { lastHeartbeat: { $gte: cutoff } },
      { status: "installing", lastHeartbeat: { $gte: installingCutoff } },
    ],
  })
    .select("userId")
    .lean();
  const liveSet = new Set(live.map((row) => String(row.userId)));

  let dropped = 0;
  for (const doc of active) {
    const isSession = doc.status === "launching" || doc.status === "playing";
    const leaderGone = !liveSet.has(String(doc.leaderId));

    if (isSession) {
      if (leaderGone) {
        // The host running the game session went offline — session is terminated.
        doc.status = "ended";
        doc.endedAt = now;
        if (Array.isArray(doc.historicalMembers)) {
          for (const hm of doc.historicalMembers) {
            if (!hm.leftAt) hm.leftAt = now;
          }
        }
        await releasePartyHost(doc);
        await releasePartyLan(doc);
        await doc.save();
        await releasePartyMemberships(String(doc._id));
        await clearPresenceForParty(String(doc._id));
        await cleanupPartyDiscordVoice(doc);
        dropped += 1;
      }
      // While the host remains live, don't drop in-game players on transient heartbeat gaps.
      continue;
    }

    // For lobby parties (forming / ready), if leader is gone and alone, end immediately.
    const mems = doc.members || [];
    if (leaderGone && mems.length <= 1) {
      doc.status = "ended";
      doc.endedAt = now;
      if (Array.isArray(doc.historicalMembers)) {
        for (const hm of doc.historicalMembers) {
          if (!hm.leftAt) hm.leftAt = now;
        }
      }
      await releasePartyHost(doc);
      await releasePartyLan(doc);
      await doc.save();
      await releasePartyMemberships(String(doc._id));
      await clearPresenceForParty(String(doc._id));
      await cleanupPartyDiscordVoice(doc);
      dropped += 1;
      continue;
    }

    const gone = mems.filter(
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
  const updated = await Party.findOneAndUpdate(
    {
      _id: doc._id,
      leaderId: Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : actorId,
      "members.userId": Types.ObjectId.isValid(targetId)
        ? new Types.ObjectId(targetId)
        : targetId,
    },
    [
      {
        $set: {
          members: {
            $filter: {
              input: "$members",
              as: "member",
              cond: { $ne: [{ $toString: "$$member.userId" }, targetId] },
            },
          },
          lastActivity: now,
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $in: ["$status", ["launching", "playing"]] },
              "$status",
              {
                $cond: [
                  {
                    $allElementsTrue: [
                      { $map: { input: "$members", as: "member", in: "$$member.ready" } },
                    ],
                  },
                  "ready",
                  "forming",
                ],
              },
            ],
          },
        },
      },
    ],
    { new: true }
  );
  if (!updated) return { error: "Party changed while removing that member", status: 400 };
  await releaseActiveMembership(targetId, partyId);
  await setPresenceParty(targetId, { partyId: null });

  return {
    party: await partyPayloadForDoc(updated.toObject()),
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
  if (doc.status === "launching" || doc.status === "playing") {
    return { error: "End the current game before transferring the host", status: 400 };
  }

  const targetMember = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === newLeaderId
  );
  if (!targetMember) {
    return { error: "New leader must be a party member", status: 400 };
  }

  const now = new Date();
  const updated = await Party.findOneAndUpdate(
    {
      _id: doc._id,
      leaderId: Types.ObjectId.isValid(currentLeaderId)
        ? new Types.ObjectId(currentLeaderId)
        : currentLeaderId,
      "members.userId": Types.ObjectId.isValid(newLeaderId)
        ? new Types.ObjectId(newLeaderId)
        : newLeaderId,
      status: { $nin: ["launching", "playing", "ended"] },
    },
    [
      {
        $set: {
          leaderId: new Types.ObjectId(newLeaderId),
          members: {
            $map: {
              input: "$members",
              as: "member",
              in: {
                $mergeObjects: [
                  "$$member",
                  {
                    role: {
                      $cond: [
                        { $eq: [{ $toString: "$$member.userId" }, newLeaderId] },
                        "leader",
                        "member",
                      ],
                    },
                  },
                ],
              },
            },
          },
          lastActivity: now,
        },
      },
    ],
    { new: true }
  );
  if (!updated) {
    return { error: "Party changed while transferring leadership", status: 400 };
  }

  return {
    party: await partyPayloadForDoc(updated.toObject()),
    status: 200,
  };
}
