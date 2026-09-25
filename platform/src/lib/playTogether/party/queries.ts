/** Reading parties: one party, a user's parties, friends' and public parties. */
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { PARTY_MAX_SIZE, PARTY_IDLE_TIMEOUT_MS, type PartyPayload } from "@/lib/playTogether/types";
import { setPresenceParty, clearPresenceForParty } from "@/lib/presence/server";
import { cleanupPartyDiscordVoice } from "@/lib/playTogether/discordPartyProvision";
import { releasePartyHost } from "@/lib/gameHost/provision";
import { releasePartyLan } from "@/lib/virtualLan/provision";
import { PartyDocLean, acceptedFriendIds, activePartyFilterForUser, ensureLeaderMembership, pickCanonicalPartyDoc, releasePartyMemberships, resolvePartyPeople } from "./people";
import { OPEN_PARTY_STATUSES, PublicPartyPayload, applyConfigSync, attachConfigSync, partyMemberIds, partyPayloadForDoc, safeConfigSync, serializePartyDocs, toPublicPartyPayload } from "./serialize";

/* ─── get party (4A) ─────────────────────────────────────────────────────── */

export async function getParty(
  partyId: string,
  viewerUserId?: string
): Promise<
  { party: PartyPayload; status: 200 } | { error: string; status: 403 | 404 }
> {
  await dbConnect();

  const doc = await Party.findById(partyId).lean();
  if (!doc) return { error: "Party not found", status: 404 };
  if (
    !viewerUserId ||
    !(doc.members as Array<{ userId: unknown }>).some(
      (member) => String(member.userId) === viewerUserId
    )
  ) {
    return { error: "Party membership required", status: 403 };
  }

  return {
    party: await attachConfigSync(
      await partyPayloadForDoc(doc as Record<string, unknown>),
      viewerUserId,
      { doc: doc as Record<string, unknown> }
    ),
    status: 200,
  };
}

/* ─── list user's active parties (4P) ────────────────────────────────────── */

export async function listPartiesForUser(
  userId: string
): Promise<PartyPayload[]> {
  await dbConnect();

  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const matchUser = userObjId ? { $in: [userId, userObjId] } : userId;
  const cutoff = new Date(Date.now() - PARTY_IDLE_TIMEOUT_MS);

  // Opportunistic cleanup: any expired party where this user is leader or member
  try {
    const expired = await Party.find({
      status: { $nin: ["ended"] },
      lastActivity: { $lt: cutoff },
      $or: [{ leaderId: matchUser }, { "members.userId": matchUser }],
    });
    for (const exp of expired) {
      exp.status = "ended";
      exp.endedAt = new Date();
      await releasePartyHost(exp);
      await releasePartyLan(exp);
      await exp.save();
      await releasePartyMemberships(String(exp._id));
      await clearPresenceForParty(String(exp._id));
      await cleanupPartyDiscordVoice(exp);
    }
  } catch (err) {
    console.warn("[party] in-band stale cleanup error:", err);
  }

  const docs = await Party.find(activePartyFilterForUser(userId))
    .sort({ lastActivity: -1 })
    .limit(10)
    .lean();

  if (docs.length === 0) return [];

  let canonical = await pickCanonicalPartyDoc(docs as PartyDocLean[], userId);
  if (!canonical) return [];

  /*
   * Healing a leader missing from their own roster is a repair, not a step in
   * the read. Deciding that from the lean doc already in hand keeps the common
   * case — a healthy party, polled several times a second — at one party read
   * instead of two, and only pays for the hydrated document when there is
   * actually something to fix.
   */
  if (
    String(canonical.leaderId) === userId &&
    !(canonical.members as Array<{ userId: unknown }>).some(
      (m) => String(m.userId) === userId
    )
  ) {
    const full = await Party.findById(canonical._id);
    if (full) {
      canonical = (await ensureLeaderMembership(
        full.toObject() as Parameters<typeof ensureLeaderMembership>[0]
      )) as PartyDocLean;
    }
  }

  /*
   * The two reads a poll still needs, started together: who is in the party
   * and whether their installs match. Neither depends on the other, and this
   * is the request every member repeats every second while in a lobby.
   */
  const wantSync = Boolean(canonical.gameSlug) && canonical.status !== "ended";
  const [people, sync] = await Promise.all([
    resolvePartyPeople(partyMemberIds(canonical)),
    wantSync ? safeConfigSync(String(canonical._id), { doc: canonical }) : null,
  ]);
  const party = applyConfigSync(
    await partyPayloadForDoc(canonical, { people }),
    sync,
    userId
  );

  // Presence's party pointer came back with the member OS read above.
  if (people.partyIdById.get(userId) !== party.id) {
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
): Promise<PublicPartyPayload[]> {
  await dbConnect();

  const friendIds = await acceptedFriendIds(userId);
  if (friendIds.length === 0) return [];

  const cutoff = new Date(Date.now() - PARTY_IDLE_TIMEOUT_MS);
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const friendObjIds = friendIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const memberMatch = [
    ...friendIds,
    ...friendObjIds,
  ];
  const ninMatch = userObjId ? [userId, userObjId] : [userId];

  // Parties where a friend is a member, visibility is "friends", and
  // the requesting user is not already in them.
  const docs = await Party.find({
    "members.userId": { $in: memberMatch, $nin: ninMatch },
    visibility: "friends",
    status: { $nin: ["ended"] },
    lastActivity: { $gte: cutoff },
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

  const parties = await serializePartyDocs(filtered as Array<Record<string, unknown>>);
  return parties.map(toPublicPartyPayload);
}

/** Public, joinable parties — waiting for players or in-progress with space. */
export async function listOpenPublicParties(
  limit = 50
): Promise<PublicPartyPayload[]> {
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
    const parties = await serializePartyDocs(
      open.slice(0, limit) as Array<Record<string, unknown>>
    );
    return parties.map(toPublicPartyPayload);
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
