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

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 4 — Party notifications
 * ──────────────────────────────────────────────────────────────────────────── */

export async function createPartyInviteNotification(opts: {
  recipientId: string;
  senderId: string;
  senderUsername: string;
  partyId: string;
  gameSlug: string;
  gameTitle: string;
  memberCount: number;
}) {
  try {
    await dbConnect();
    await Notification.create({
      userId: opts.recipientId,
      type: "party_invite",
      title: `${opts.senderUsername} invited you to a party`,
      body: `${opts.gameTitle} · ${opts.memberCount} player${opts.memberCount === 1 ? "" : "s"} currently in party`,
      href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
      meta: {
        partyId: opts.partyId,
        fromUserId: opts.senderId,
        fromUsername: opts.senderUsername,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
        memberCount: opts.memberCount,
        actions: ["join", "decline"],
      },
    });
  } catch (err) {
    console.error("createPartyInviteNotification failed:", err);
  }
}

export async function createPartyJoinNotification(opts: {
  partyMemberIds: string[];
  joinedUserId: string;
  joinedUsername: string;
  partyId: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    const recipients = opts.partyMemberIds.filter(
      (id) => id !== opts.joinedUserId
    );
    if (recipients.length === 0) return;
    await Notification.insertMany(
      recipients.map((recipientId) => ({
        userId: recipientId,
        type: "party_joined",
        title: `${opts.joinedUsername} joined the party`,
        body: opts.gameTitle,
        href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
        meta: {
          partyId: opts.partyId,
          fromUserId: opts.joinedUserId,
          fromUsername: opts.joinedUsername,
        },
      }))
    );
  } catch (err) {
    console.error("createPartyJoinNotification failed:", err);
  }
}

export async function createPartyLaunchedNotification(opts: {
  partyMemberIds: string[];
  leaderId: string;
  leaderUsername: string;
  partyId: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    const recipients = opts.partyMemberIds.filter(
      (id) => id !== opts.leaderId
    );
    if (recipients.length === 0) return;
    await Notification.insertMany(
      recipients.map((recipientId) => ({
        userId: recipientId,
        type: "party_launched",
        title: `Party launched — ${opts.gameTitle}`,
        body: `${opts.leaderUsername} started the game`,
        href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
        meta: {
          partyId: opts.partyId,
          fromUserId: opts.leaderId,
          fromUsername: opts.leaderUsername,
          gameTitle: opts.gameTitle,
        },
      }))
    );
  } catch (err) {
    console.error("createPartyLaunchedNotification failed:", err);
  }
}

export async function createPartyLeaderChangedNotification(opts: {
  partyMemberIds: string[];
  newLeaderId: string;
  newLeaderUsername: string;
  partyId: string;
}) {
  try {
    await dbConnect();
    const recipients = opts.partyMemberIds.filter(
      (id) => id !== opts.newLeaderId
    );
    if (recipients.length === 0) return;
    await Notification.insertMany(
      recipients.map((recipientId) => ({
        userId: recipientId,
        type: "party_leader_changed",
        title: `${opts.newLeaderUsername} is now party leader`,
        body: null,
        href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
        meta: {
          partyId: opts.partyId,
          fromUserId: opts.newLeaderId,
          fromUsername: opts.newLeaderUsername,
        },
      }))
    );
  } catch (err) {
    console.error("createPartyLeaderChangedNotification failed:", err);
  }
}
