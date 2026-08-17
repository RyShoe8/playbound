import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import Notification from "@/lib/models/Notification";
import Party from "@/lib/models/Party";
import Presence from "@/lib/models/Presence";
import { getGame } from "@/lib/catalog";
import { createFriendPlayingNotification } from "@/lib/playTogether/notify";
import { FRIEND_PLAYING_NOTIFY_COOLDOWN_MS } from "@/lib/playTogether/types";

/**
 * Friends who are already in this with the player, and so should not be told
 * about it.
 *
 * Sharing an active party always counts: you agreed to play together, so being
 * told your own party member started the game you are both about to launch is
 * pure noise.
 *
 * `alreadyPlaying` additionally excludes friends who are in that game right
 * now. That is right for "started playing" — they can see them in the game —
 * but wrong for "looking for players", where being in the game is exactly what
 * makes the news useful.
 *
 * Both queries are scoped to the friend list the caller already resolved, so
 * this costs two indexed lookups no matter how large the friend list is.
 */
export async function findInvolvedFriendIds(
  userId: string,
  friendIds: string[],
  opts: { alreadyPlaying?: string | null } = {}
): Promise<Set<string>> {
  const involved = new Set<string>();
  if (!friendIds.length) return involved;

  const gameSlug = opts.alreadyPlaying || null;
  const [parties, playing] = await Promise.all([
    Party.find({ "members.userId": userId, status: { $nin: ["ended"] } })
      .select("members.userId")
      .lean(),
    gameSlug
      ? Presence.find({
          userId: { $in: friendIds },
          status: "playing",
          currentGameId: gameSlug,
        })
          .select("userId")
          .lean()
      : Promise.resolve([]),
  ]);

  const friendSet = new Set(friendIds);
  for (const party of parties as { members?: { userId: unknown }[] }[]) {
    for (const member of party.members || []) {
      const id = String(member.userId);
      if (id !== userId && friendSet.has(id)) involved.add(id);
    }
  }
  for (const row of playing as { userId: unknown }[]) {
    involved.add(String(row.userId));
  }
  return involved;
}

/**
 * Notify accepted friends when a user transitions into playing a game.
 * Fire-and-forget from the heartbeat path — failures must never block presence.
 */
export async function maybeNotifyFriendsStartedPlaying(opts: {
  userId: string;
  previousStatus?: string | null;
  previousGameId?: string | null;
  nextStatus?: string | null;
  nextGameId?: string | null;
}): Promise<void> {
  try {
    const nextStatus = opts.nextStatus || null;
    const nextGame = opts.nextGameId || null;
    if (nextStatus !== "playing" || !nextGame) return;

    const wasSame =
      opts.previousStatus === "playing" && opts.previousGameId === nextGame;
    if (wasSame) return;

    await dbConnect();
    const [me, game] = await Promise.all([
      User.findById(opts.userId).select("username preferences").lean(),
      getGame(nextGame, { includeTesting: true }),
    ]);
    if (!me || !game) return;
    if (Boolean((me as { preferences?: { appearOffline?: boolean } }).preferences?.appearOffline)) {
      return;
    }
    if (
      Boolean(
        (me as { preferences?: { hideActivityFromFriends?: boolean } }).preferences
          ?.hideActivityFromFriends
      )
    ) {
      return;
    }

    const friendships = await Friend.find({
      status: "accepted",
      $or: [{ requesterId: opts.userId }, { recipientId: opts.userId }],
    })
      .select("requesterId recipientId")
      .lean();

    const friendIds = friendships.map((f) => {
      const a = String(f.requesterId);
      const b = String(f.recipientId);
      return a === opts.userId ? b : a;
    });
    if (!friendIds.length) return;

    const [friends, involved] = await Promise.all([
      User.find({ _id: { $in: friendIds } })
        .select("preferences")
        .lean(),
      findInvolvedFriendIds(opts.userId, friendIds, { alreadyPlaying: nextGame }),
    ]);

    const cutoff = new Date(Date.now() - FRIEND_PLAYING_NOTIFY_COOLDOWN_MS);
    const username = String(me.username || "A friend");

    await Promise.all(
      friends.map(async (friend) => {
        const prefs = (friend as { preferences?: { notifyFriendActivity?: boolean } }).preferences;
        if (prefs?.notifyFriendActivity === false) return;
        // Already in this with them — telling them is noise.
        if (involved.has(String(friend._id))) return;

        const recent = await Notification.findOne({
          userId: friend._id,
          type: "friend_started_playing",
          "meta.fromUserId": opts.userId,
          "meta.gameSlug": nextGame,
          createdAt: { $gte: cutoff },
        })
          .select("_id")
          .lean();
        if (recent) return;

        await createFriendPlayingNotification({
          recipientId: String(friend._id),
          fromUserId: opts.userId,
          fromUsername: username,
          gameSlug: nextGame,
          gameTitle: game.title,
        });
      })
    );
  } catch (err) {
    console.error("maybeNotifyFriendsStartedPlaying failed:", err);
  }
}
