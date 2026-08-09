import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import Notification from "@/lib/models/Notification";
import { getGame } from "@/lib/catalog";
import { createFriendPlayingNotification } from "@/lib/playTogether/notify";
import { FRIEND_PLAYING_NOTIFY_COOLDOWN_MS } from "@/lib/playTogether/types";

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

    const friends = await User.find({ _id: { $in: friendIds } })
      .select("preferences")
      .lean();

    const cutoff = new Date(Date.now() - FRIEND_PLAYING_NOTIFY_COOLDOWN_MS);
    const username = String(me.username || "A friend");

    await Promise.all(
      friends.map(async (friend) => {
        const prefs = (friend as { preferences?: { notifyFriendActivity?: boolean } }).preferences;
        if (prefs?.notifyFriendActivity === false) return;

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
