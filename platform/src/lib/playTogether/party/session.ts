/** Joining, leaving, launching and ending the game session. */
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import Presence from "@/lib/models/Presence";
import { type PartyPayload } from "@/lib/playTogether/types";
import { trackPartyEvent } from "@/lib/playTogether/partyTelemetry";
import { clearPresenceForParty } from "@/lib/presence/server";
import { cleanupPartyDiscordVoice, placePartyDiscordVoice } from "@/lib/playTogether/discordPartyProvision";
import { releasePartyHost } from "@/lib/gameHost/provision";
import { releasePartyLan } from "@/lib/virtualLan/provision";
import { isVirtualLanGame } from "@/lib/multiplayer/adapters";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";
import { applyPresenceFreshness } from "@/lib/friends/presenceMask";
import { canLaunch, derivePartyStatus, readySummary } from "@/lib/playTogether/partyRules";
import { ensurePartyConnectReady } from "./connect";
import { releasePartyMemberships, toRuleParty } from "./people";
import { partyPayloadForDoc } from "./serialize";
import { PartyDoc } from "./types";

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
    const { allReady } = readySummary(doc.members);
    if (!allReady) {
      return { error: "Everyone must ready up before starting", status: 400 };
    }
  }
  const hostMode = resolvedHostMode(String(doc.gameSlug), doc.hostMode, doc.hosted);
  const isLeader = String(doc.leaderId) === userId;
  /*
   * `selfHostReady` means a listen server answered a probe. A virtual-LAN game
   * never produces one: there is no address to connect to, which is the entire
   * reason it is on an overlay segment, and the launcher's probe is skipped for
   * UDP anyway — HoloCure's discovery is UDP 27015.
   *
   * So gating those members on it meant waiting on a flag nothing could ever
   * set. HoloCure resolves to hostMode "self" (the room is the leader's PC), so
   * every member sat on "Waiting for host" indefinitely no matter what the host
   * did. For these games the party being in flight is the readiness signal, and
   * finding the host is the game's own job once everyone is on the segment.
   */
  if (hostMode === "self" && !isLeader) {
    const isVLan = isVirtualLanGame(String(doc.gameSlug || ""));
    if (isVLan ? firstLaunch : !doc.selfHostReady) {
      return { error: "Waiting for host", status: 400 };
    }
  }
  /*
   * Couch games have one copy running, on the leader's machine. A member
   * launching their own would start a separate single-player session and mark
   * the party as playing — they join by opening the controller link instead.
   */
  if (hostMode === "couch" && !isLeader) {
    return {
      error: "This game plays on the host's PC — use Join online to stream the game from the host.",
      status: 400,
    };
  }
  const connect = await ensurePartyConnectReady(doc);
  if ("error" in connect) {
    return { error: connect.error, status: 400 };
  }
  if (firstLaunch) {
    doc.status =
      hostMode === "self" && !isVirtualLanGame(String(doc.gameSlug || ""))
        ? "launching"
        : "playing";
    if (hostMode === "self") {
      doc.selfHostReady = false;
      doc.selfHostReadyAt = null;
    }
    doc.lastActivity = new Date();
    await doc.save();
    await placePartyDiscordVoice(doc);
  } else if (doc.discord?.voiceChannelId && !doc.discord.relocatedAt) {
    await placePartyDiscordVoice(doc);
  }

  const joined = await partyPayloadForDoc(doc.toObject());
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
  doc.selfHostReady = false;
  doc.selfHostReadyAt = null;
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

  return {
    party: await partyPayloadForDoc(refreshed.toObject()),
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
  const hostMode = resolvedHostMode(String(doc.gameSlug), doc.hostMode, doc.hosted);
  doc.status = hostMode === "self" ? "launching" : "playing";
  if (hostMode === "self") {
    doc.selfHostReady = false;
    doc.selfHostReadyAt = null;
  }
  doc.lastActivity = now;
  await doc.save();

  const launched = await partyPayloadForDoc(doc.toObject());
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

/** Leader acknowledgement after its launcher observes the local server bind. */
export async function markSelfHostReady(
  partyId: string,
  leaderId: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();
  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) return { error: "Only the host can ready the server", status: 403 };
  if (resolvedHostMode(String(doc.gameSlug || ""), doc.hostMode, doc.hosted) !== "self") {
    return { error: "Party is not self-hosted", status: 400 };
  }
  if (doc.status !== "launching") {
    return { error: "The party must be launching before the host can become ready", status: 400 };
  }
  doc.selfHostReady = true;
  doc.selfHostReadyAt = new Date();
  doc.status = "playing";
  doc.lastActivity = new Date();
  await doc.save();
  return { party: await partyPayloadForDoc(doc.toObject()), status: 200 };
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
  if (Array.isArray(doc.historicalMembers)) {
    for (const hm of doc.historicalMembers) {
      if (!hm.leftAt) hm.leftAt = now;
    }
  }
  await releasePartyHost(doc);
  await releasePartyLan(doc);
  await doc.save();
  await releasePartyMemberships(partyId);
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
