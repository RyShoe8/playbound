import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import {
  createFriendAcceptedNotification,
  createFriendRequestNotification,
} from "@/lib/notifications";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export type SendFriendRequestResult =
  | { ok: true; friendshipId: string; autoAccepted?: boolean; alreadyPending?: boolean; alreadyFriends?: boolean }
  | { ok: false; error: string; status: number };

/**
 * Create or advance a friendship from `requesterId` → `targetUserId`.
 * Shared by POST /api/friends/request and email invite / redeem.
 */
export async function sendFriendRequestBetween(
  requesterId: string,
  targetUserId: string,
  opts?: { skipTelemetry?: boolean }
): Promise<SendFriendRequestResult> {
  if (requesterId === targetUserId) {
    return { ok: false, error: "Cannot send a friend request to yourself", status: 400 };
  }

  const targetUser = await User.findById(targetUserId).select("username disabled").lean();
  if (!targetUser || targetUser.disabled) {
    return { ok: false, error: "User not found", status: 404 };
  }

  const existing = await Friend.findOne({
    $or: [
      { requesterId, recipientId: targetUserId },
      { requesterId: targetUserId, recipientId: requesterId },
    ],
  });

  const fromUsername =
    (await User.findById(requesterId).select("username").lean())?.username || "Someone";

  if (existing) {
    if (existing.status === "blocked") {
      return { ok: false, error: "Cannot send request", status: 403 };
    }
    if (existing.status === "accepted") {
      return { ok: true, friendshipId: String(existing._id), alreadyFriends: true };
    }
    if (existing.status === "pending") {
      if (
        existing.requesterId.toString() === targetUserId &&
        existing.recipientId.toString() === requesterId
      ) {
        existing.status = "accepted";
        existing.acceptedAt = new Date();
        await existing.save();
        void createFriendAcceptedNotification({
          recipientId: String(existing.requesterId),
          fromUserId: requesterId,
          fromUsername: String(fromUsername),
          friendshipId: String(existing._id),
        });
        if (!opts?.skipTelemetry) {
          void saveEvent({
            event: "friend_request_accepted",
            properties: { friendshipId: String(existing._id), via: "reverse_request" },
            userId: requesterId,
          });
        }
        return { ok: true, friendshipId: String(existing._id), autoAccepted: true };
      }
      return { ok: true, friendshipId: String(existing._id), alreadyPending: true };
    }
    if (existing.status === "declined" || existing.status === "cancelled") {
      existing.set({
        requesterId,
        recipientId: targetUserId,
        status: "pending",
        acceptedAt: null,
      });
      await existing.save();
      void createFriendRequestNotification({
        recipientId: String(targetUserId),
        fromUserId: requesterId,
        fromUsername: String(fromUsername),
        friendshipId: String(existing._id),
      });
      if (!opts?.skipTelemetry) {
        void saveEvent({
          event: "friend_request_sent",
          properties: { targetUserId: String(targetUserId) },
          userId: requesterId,
        });
      }
      return { ok: true, friendshipId: String(existing._id) };
    }
    return {
      ok: false,
      error: `Relationship already exists (status: ${existing.status})`,
      status: 400,
    };
  }

  const friendRequest = await Friend.create({
    requesterId,
    recipientId: targetUserId,
    status: "pending",
  });

  void createFriendRequestNotification({
    recipientId: String(targetUserId),
    fromUserId: requesterId,
    fromUsername: String(fromUsername),
    friendshipId: String(friendRequest._id),
  });
  if (!opts?.skipTelemetry) {
    void saveEvent({
      event: "friend_request_sent",
      properties: { targetUserId: String(targetUserId) },
      userId: requesterId,
    });
  }

  return { ok: true, friendshipId: String(friendRequest._id) };
}
