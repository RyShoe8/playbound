/**
 * Party rules — pure functions, no DB.
 *
 * These answer questions about party state transitions and membership
 * without touching Mongoose, so they're fast, testable, and reusable
 * from both API routes and the service layer.
 */

import type { PartyStatus, PartyVisibility, PartyMemberRole } from "@/lib/playTogether/types";
import { PARTY_STATUSES } from "@/lib/playTogether/types";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Member types for rule evaluation (DB-agnostic)                         */
/* ────────────────────────────────────────────────────────────────────────── */

export type RuleMember = {
  userId: string;
  role: PartyMemberRole;
  ready: boolean;
  joinedAt: Date | string;
};

export type RuleParty = {
  leaderId: string;
  members: RuleMember[];
  status: PartyStatus;
  visibility: PartyVisibility;
  maxSize: number;
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Join eligibility                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export function canJoinParty(
  party: RuleParty,
  userId: string,
  isFriend: boolean,
  passwordOk = false
): { ok: boolean; reason?: string } {
  if (party.status === "ended") {
    return { ok: false, reason: "Party has ended" };
  }
  if (party.status === "launching") {
    return { ok: false, reason: "Party is currently launching" };
  }

  const alreadyMember = party.members.some((m) => m.userId === userId);
  if (alreadyMember) {
    return { ok: false, reason: "Already in this party" };
  }

  if (party.members.length >= party.maxSize) {
    return { ok: false, reason: "Party is full" };
  }

  if (party.visibility === "public") {
    return { ok: true };
  }

  if (party.visibility === "password") {
    if (!passwordOk) {
      return { ok: false, reason: "Password required" };
    }
    return { ok: true };
  }

  if (party.visibility === "invite_only") {
    // Invite-only parties require an accepted invitation — the caller
    // (service layer) handles the invite check separately.
    return { ok: true };
  }

  if (party.visibility === "friends") {
    if (!isFriend) {
      return { ok: false, reason: "This party is friends-only" };
    }
    return { ok: true };
  }

  // "event" visibility — anyone attending the event can join.
  // Event attendance check is done in the service layer.
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Leave eligibility                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export function canLeaveParty(
  party: RuleParty,
  userId: string
): { ok: boolean; reason?: string } {
  if (party.status === "ended") {
    return { ok: false, reason: "Party has already ended" };
  }
  const isMember = party.members.some((m) => m.userId === userId);
  if (!isMember) {
    return { ok: false, reason: "Not in this party" };
  }
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Leadership transfer                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Determine who becomes leader when the current leader leaves.
 * Returns the userId of the earliest-joined remaining member, or null
 * if the party would be empty.
 */
export function nextLeader(
  members: RuleMember[],
  leavingUserId: string
): string | null {
  const remaining = members
    .filter((m) => m.userId !== leavingUserId)
    .sort(
      (a, b) =>
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
  return remaining.length > 0 ? remaining[0].userId : null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Ready check                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function isEveryoneReady(members: RuleMember[]): boolean {
  if (members.length === 0) return false;
  return members.every((m) => m.ready);
}

export function readySummary(members: RuleMember[]): {
  ready: number;
  total: number;
  allReady: boolean;
} {
  const ready = members.filter((m) => m.ready).length;
  return { ready, total: members.length, allReady: ready === members.length && members.length > 0 };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Status transitions                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

const ALLOWED_TRANSITIONS: Record<PartyStatus, PartyStatus[]> = {
  forming: ["ready", "launching", "playing", "ended"],
  ready: ["forming", "launching", "playing", "ended"],
  launching: ["playing", "ended"],
  playing: ["ended"],
  ended: [],
};

export function canTransitionTo(
  current: PartyStatus,
  target: PartyStatus
): boolean {
  return ALLOWED_TRANSITIONS[current]?.includes(target) ?? false;
}

/**
 * Determine the appropriate status based on member ready states.
 * forming → ready when everyone is ready (and ≥ 2 members).
 * ready → forming if someone un-readies.
 */
export function derivePartyStatus(
  current: PartyStatus,
  members: RuleMember[]
): PartyStatus {
  if (current === "ended" || current === "launching" || current === "playing") {
    return current;
  }
  if (members.length === 0) return "ended";
  if (isEveryoneReady(members) && members.length >= 2) return "ready";
  return "forming";
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Leader controls                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export function isLeader(party: RuleParty, userId: string): boolean {
  return party.leaderId === userId;
}

export function canRemoveMember(
  party: RuleParty,
  actorId: string,
  targetId: string
): { ok: boolean; reason?: string } {
  if (!isLeader(party, actorId)) {
    return { ok: false, reason: "Only the party leader can remove members" };
  }
  if (actorId === targetId) {
    return { ok: false, reason: "Use leave instead of removing yourself" };
  }
  if (party.status === "ended") {
    return { ok: false, reason: "Party has ended" };
  }
  const targetMember = party.members.find((m) => m.userId === targetId);
  if (!targetMember) {
    return { ok: false, reason: "User is not in this party" };
  }
  return { ok: true };
}

export function canLaunch(
  party: RuleParty,
  userId: string
): { ok: boolean; reason?: string } {
  if (!isLeader(party, userId)) {
    return { ok: false, reason: "Only the party leader can launch" };
  }
  if (party.status === "ended") {
    return { ok: false, reason: "Party has ended" };
  }
  if (party.status === "launching" || party.status === "playing") {
    return { ok: false, reason: "Party has already launched" };
  }
  if (party.members.length < 2) {
    return { ok: false, reason: "Need at least 2 members to launch" };
  }
  return { ok: true };
}
