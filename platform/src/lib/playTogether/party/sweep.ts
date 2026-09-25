/** Background upkeep: idle parties, presence changes, old chat messages. */
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Presence from "@/lib/models/Presence";
import PartyMessage from "@/lib/models/PartyMessage";
import { PARTY_IDLE_TIMEOUT_MS } from "@/lib/playTogether/types";
import { STALE_AFTER_MS } from "@/lib/presence/types";
import { clearPresenceForParty } from "@/lib/presence/server";
import { cleanupPartyDiscordVoice } from "@/lib/playTogether/discordPartyProvision";
import { releasePartyHost } from "@/lib/gameHost/provision";
import { releasePartyLan } from "@/lib/virtualLan/provision";
import { releasePartyMemberships, safeLeaveParty } from "./people";

/* ─── sweep stale parties (cron) ─────────────────────────────────────────── */

/**
 * Keep in-session parties visible while someone is actively playing.
 *
 * Presence heartbeats do not mutate the party document, so without this
 * lastActivity freezes at launch and list filters / idle sweeps treat a live
 * match as abandoned after fifteen minutes.
 */
export async function touchPartyActivityFromPresence(
  userId: string,
  presenceStatus: string | null | undefined
): Promise<void> {
  if (presenceStatus !== "playing") return;
  await dbConnect();
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const matchUser = userObjId ? { $in: [userId, userObjId] } : userId;
  await Party.updateMany(
    {
      status: { $in: ["launching", "playing"] },
      "members.userId": matchUser,
    },
    { $set: { lastActivity: new Date() } }
  );
}

export async function sweepStaleParties(now = new Date()) {
  await dbConnect();
  const cutoff = new Date(now.getTime() - PARTY_IDLE_TIMEOUT_MS);

  const stale = await Party.find({
    status: { $nin: ["ended"] },
    lastActivity: { $lt: cutoff },
  });

  /*
   * Idle is judged on presence, not on party mutations.
   *
   * lastActivity only moves when someone joins, readies, changes a setting or
   * launches — and none of that happens while a match is being played. A party
   * that launched and then simply got played therefore looked idle from the
   * moment it started, and this sweep ended it fifteen minutes in, with the
   * status still reading "playing". That is not a backstop for a dead machine,
   * it is a timer on every session longer than a quarter of an hour.
   *
   * dropOfflinePartyMembers already learned this and skips in-session parties
   * for exactly the same reason: the launcher sits behind a fullscreen game and
   * goes quiet while the people in it are demonstrably there. It deferred to
   * this sweep as the safety net, which was sound — the net was just strung
   * from the wrong measurement.
   *
   * A live heartbeat from any member is what keeps a party alive now. When
   * every member has gone silent the party still ends on schedule, so a PC that
   * dies mid-match is cleaned up exactly as before.
   */
  const staleMemberIds = [
    ...new Set(
      stale.flatMap((doc) =>
        (doc.members || []).map((m: { userId: unknown }) => String(m.userId))
      )
    ),
  ];
  const liveSet = new Set<string>();
  if (staleMemberIds.length > 0) {
    const live = await Presence.find({
      userId: { $in: staleMemberIds },
      status: { $ne: "offline" },
      lastHeartbeat: { $gte: new Date(now.getTime() - STALE_AFTER_MS) },
    })
      .select("userId")
      .lean();
    for (const row of live) liveSet.add(String(row.userId));
  }

  let ended = 0;
  let kept = 0;
  for (const doc of stale) {
    const leaderLive = liveSet.has(String(doc.leaderId));
    const stillThere = (doc.members || []).some((m: { userId: unknown }) =>
      liveSet.has(String(m.userId))
    );
    // If the host/leader is gone, or all members are gone, the party cannot stay alive.
    if (leaderLive && stillThere) {
      /*
       * Touched rather than merely skipped, so the party is not re-examined on
       * every pass for as long as it runs.
       */
      doc.lastActivity = now;
      await doc.save();
      kept += 1;
      continue;
    }
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
    ended += 1;
  }
  if (kept > 0) {
    console.log(`[party] idle sweep kept ${kept} part${kept === 1 ? "y" : "ies"} with live members`);
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
 * Called when a user's presence session ends (e.g. launcher quits).
 * Immediately cleans up any party where the user was the host or a member.
 */
export async function handleUserPresenceEnded(userId: string): Promise<void> {
  await dbConnect();
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  const matchUser = userObjId ? { $in: [userId, userObjId] } : userId;

  try {
    const leaderParties = await Party.find({
      leaderId: matchUser,
      status: { $nin: ["ended"] },
    });

    for (const doc of leaderParties) {
      const mems = doc.members || [];
      if (mems.length <= 1 || doc.status === "launching" || doc.status === "playing") {
        doc.status = "ended";
        doc.endedAt = new Date();
        await releasePartyHost(doc);
        await releasePartyLan(doc);
        await doc.save();
        await releasePartyMemberships(String(doc._id));
        await clearPresenceForParty(String(doc._id));
        await cleanupPartyDiscordVoice(doc);
      } else {
        await safeLeaveParty(String(doc._id), userId);
      }
    }

    const memberParties = await Party.find({
      leaderId: { $ne: matchUser },
      "members.userId": matchUser,
      status: { $nin: ["ended"] },
    });

    for (const doc of memberParties) {
      await safeLeaveParty(String(doc._id), userId);
    }
  } catch (err) {
    console.warn("[party] handleUserPresenceEnded error:", err);
  }
}

/**
 * Deletes chat messages older than 24 hours for ended parties or orphaned records,
 * while strictly preserving all messages for active/in-progress parties.
 */
async function sweepOldPartyMessages(olderThanMs = 24 * 60 * 60 * 1000) {
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
