import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";

/** Mark friend_request notifications for a friendship as read (accept/decline/cancel). */
export async function markFriendRequestNotificationsRead(opts: {
  userId?: string | null;
  friendshipId: string;
}): Promise<void> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> = {
      type: "friend_request",
      readAt: null,
      "meta.friendshipId": String(opts.friendshipId),
    };
    if (opts.userId) filter.userId = opts.userId;
    await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  } catch (err) {
    console.error("markFriendRequestNotificationsRead failed:", err);
  }
}

export async function createFriendRequestNotification(opts: {
  recipientId: string;
  fromUserId: string;
  fromUsername: string;
  friendshipId: string;
}): Promise<void> {
  try {
    await dbConnect();
    const username = opts.fromUsername || "Someone";
    await Notification.create({
      userId: opts.recipientId,
      type: "friend_request",
      title: `${username} sent you a friend request`,
      body: "Open Friends to accept or decline.",
      href: "/friends",
      meta: {
        friendshipId: String(opts.friendshipId),
        fromUserId: opts.fromUserId,
        fromUsername: username,
      },
    });
  } catch (err) {
    console.error("createFriendRequestNotification failed:", err);
  }
}
