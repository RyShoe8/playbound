/**
 * Pure invite status helpers — UI/API ask these questions; DB writes stay in invites.ts.
 * Keep mechanism-free so tests don't need Mongo.
 */

import type { PlayInviteStatus } from "@/lib/playTogether/types";

export function canSenderCancel(status: PlayInviteStatus): boolean {
  return status === "pending";
}

export function canRecipientRespond(status: PlayInviteStatus): boolean {
  return status === "pending";
}

export function nextInviteStatus(
  current: PlayInviteStatus,
  action: "accept" | "decline" | "cancel" | "expire",
  now: Date,
  expiresAt: Date
): { status: PlayInviteStatus; error?: string } {
  if (current === "pending" && expiresAt.getTime() <= now.getTime()) {
    return { status: "expired", error: action === "expire" ? undefined : "Invite expired" };
  }
  if (current !== "pending") {
    return { status: current, error: "Invite is no longer pending" };
  }
  switch (action) {
    case "accept":
      return { status: "accepted" };
    case "decline":
      return { status: "declined" };
    case "cancel":
      return { status: "cancelled" };
    case "expire":
      return { status: "expired" };
    default:
      return { status: current, error: "Unknown action" };
  }
}

export function isDuplicatePendingInvite(opts: {
  existingPending: boolean;
}): boolean {
  return opts.existingPending;
}
