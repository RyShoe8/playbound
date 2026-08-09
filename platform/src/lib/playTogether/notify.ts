import dbConnect from "@/lib/db";
import Notification from "@/lib/models/Notification";

export async function createPlayInviteNotification(opts: {
  recipientId: string;
  senderId: string;
  senderUsername: string;
  inviteId: string;
  gameSlug: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    await Notification.create({
      userId: opts.recipientId,
      type: "play_invite",
      title: `${opts.senderUsername} invited you to play`,
      body: opts.gameTitle,
      href: `/games/${encodeURIComponent(opts.gameSlug)}?playInvite=${encodeURIComponent(opts.inviteId)}`,
      meta: {
        inviteId: opts.inviteId,
        fromUserId: opts.senderId,
        fromUsername: opts.senderUsername,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
        actions: ["play", "decline"],
      },
    });
  } catch (err) {
    console.error("createPlayInviteNotification failed:", err);
  }
}

export async function createPlayInviteResponseNotification(opts: {
  recipientId: string;
  fromUserId: string;
  fromUsername: string;
  inviteId: string;
  gameSlug: string;
  gameTitle: string;
  accepted: boolean;
}) {
  try {
    await dbConnect();
    await Notification.create({
      userId: opts.recipientId,
      type: opts.accepted ? "play_invite_accepted" : "play_invite_declined",
      title: opts.accepted
        ? `${opts.fromUsername} accepted your play invite`
        : `${opts.fromUsername} declined your play invite`,
      body: opts.gameTitle,
      href: `/games/${encodeURIComponent(opts.gameSlug)}`,
      meta: {
        inviteId: opts.inviteId,
        fromUserId: opts.fromUserId,
        fromUsername: opts.fromUsername,
        gameSlug: opts.gameSlug,
      },
    });
  } catch (err) {
    console.error("createPlayInviteResponseNotification failed:", err);
  }
}

export async function createFriendPlayingNotification(opts: {
  recipientId: string;
  fromUserId: string;
  fromUsername: string;
  gameSlug: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    await Notification.create({
      userId: opts.recipientId,
      type: "friend_started_playing",
      title: `${opts.fromUsername} just started playing ${opts.gameTitle}`,
      body: "Jump in if you can play together.",
      href: `/games/${encodeURIComponent(opts.gameSlug)}`,
      meta: {
        fromUserId: opts.fromUserId,
        fromUsername: opts.fromUsername,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
        actions: ["join"],
      },
    });
  } catch (err) {
    console.error("createFriendPlayingNotification failed:", err);
  }
}

export async function createFriendLfgNotification(opts: {
  recipientId: string;
  fromUserId: string;
  fromUsername: string;
  gameSlug: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    await Notification.create({
      userId: opts.recipientId,
      type: "friend_looking_for_players",
      title: `${opts.fromUsername} is looking for players`,
      body: opts.gameTitle,
      href: `/games/${encodeURIComponent(opts.gameSlug)}`,
      meta: {
        fromUserId: opts.fromUserId,
        fromUsername: opts.fromUsername,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
        actions: ["join"],
      },
    });
  } catch (err) {
    console.error("createFriendLfgNotification failed:", err);
  }
}
