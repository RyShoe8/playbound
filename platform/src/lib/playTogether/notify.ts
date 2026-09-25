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
  gameSlug?: string | null;
  gameTitle?: string | null;
  partyName?: string | null;
  memberCount: number;
}) {
  try {
    await dbConnect();
    const count = `${opts.memberCount} player${opts.memberCount === 1 ? "" : "s"} currently in party`;
    const headline = opts.gameTitle || opts.partyName;
    await Notification.create({
      userId: opts.recipientId,
      type: "party_invite",
      title: `${opts.senderUsername} invited you to a party`,
      body: headline ? `${headline} · ${count}` : count,
      href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
      meta: {
        partyId: opts.partyId,
        fromUserId: opts.senderId,
        fromUsername: opts.senderUsername,
        gameSlug: opts.gameSlug || null,
        gameTitle: opts.gameTitle || null,
        partyName: opts.partyName || null,
        memberCount: opts.memberCount,
        actions: ["join", "decline"],
      },
    });
  } catch (err) {
    console.error("createPartyInviteNotification failed:", err);
  }
}

export async function createLtpMatchNotification(opts: {
  userId: string;
  matchedUsername: string;
  matchedUserId: string;
  partyId?: string | null;
  gameSlug: string;
  gameTitle: string;
}) {
  try {
    await dbConnect();
    // 15-min cooldown to avoid spam
    const recent = await Notification.findOne({
      userId: opts.userId,
      type: "ltp_match_found",
      "meta.matchedUserId": opts.matchedUserId,
      "meta.gameSlug": opts.gameSlug,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
    }).lean();
    if (recent) return;

    await Notification.create({
      userId: opts.userId,
      type: "ltp_match_found",
      title: `${opts.matchedUsername} also wants to play ${opts.gameTitle}`,
      body: opts.partyId ? "A party has been opened. Click to join!" : "Click to view multiplayer.",
      href: opts.partyId ? `/friends?party=${encodeURIComponent(opts.partyId)}` : `/multiplayer`,
      meta: {
        matchedUserId: opts.matchedUserId,
        matchedUsername: opts.matchedUsername,
        partyId: opts.partyId || null,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
      },
    });
  } catch (err) {
    console.error("createLtpMatchNotification failed:", err);
  }
}

export async function createLtpPartyReadyNotification(opts: {
  userId: string;
  partyId: string;
  gameSlug: string;
  gameTitle: string;
  partyLeaderUsername: string;
}) {
  try {
    await dbConnect();
    // 15-min cooldown
    const recent = await Notification.findOne({
      userId: opts.userId,
      type: "ltp_party_ready",
      "meta.partyId": opts.partyId,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
    }).lean();
    if (recent) return;

    await Notification.create({
      userId: opts.userId,
      type: "ltp_party_ready",
      title: `An open ${opts.gameTitle} Party is waiting for you`,
      body: `Hosted by ${opts.partyLeaderUsername}. Click to jump in!`,
      href: `/friends?party=${encodeURIComponent(opts.partyId)}`,
      meta: {
        partyId: opts.partyId,
        gameSlug: opts.gameSlug,
        gameTitle: opts.gameTitle,
        partyLeaderUsername: opts.partyLeaderUsername,
      },
    });
  } catch (err) {
    console.error("createLtpPartyReadyNotification failed:", err);
  }
}

