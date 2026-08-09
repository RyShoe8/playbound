import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getGame } from "@/lib/catalog";
import { LFG_TTL_MS } from "@/lib/playTogether/types";
import { createFriendLfgNotification } from "@/lib/playTogether/notify";

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as { enabled?: boolean; gameSlug?: string | null };
    const enabled = Boolean(body.enabled);
    await dbConnect();

    if (!enabled) {
      await Presence.findOneAndUpdate(
        { userId },
        { $set: { lookingForPlayersUntil: null, lookingForPlayersGameId: null } },
        { upsert: true }
      );
      return NextResponse.json({ active: false, expiresAt: null, gameSlug: null });
    }

    const gameSlug = body.gameSlug ? String(body.gameSlug).trim() : null;
    if (gameSlug) {
      const game = await getGame(gameSlug, { includeTesting: true });
      if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + LFG_TTL_MS);
    const presence = await Presence.findOneAndUpdate(
      { userId },
      {
        $set: {
          lookingForPlayersUntil: expiresAt,
          lookingForPlayersGameId: gameSlug,
          lastHeartbeat: new Date(),
        },
        $setOnInsert: { userId, status: "online", startedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    ).lean();

    // Notify friends (soft-fail).
    void notifyFriendsLfg(userId, gameSlug).catch(() => undefined);

    return NextResponse.json({
      active: true,
      expiresAt,
      gameSlug: presence?.lookingForPlayersGameId || gameSlug,
    });
  } catch (err) {
    console.error("presence/lfg POST failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function notifyFriendsLfg(userId: string, gameSlug: string | null) {
  if (!gameSlug) return;
  const [me, game, friendships] = await Promise.all([
    User.findById(userId).select("username preferences").lean(),
    getGame(gameSlug, { includeTesting: true }),
    Friend.find({
      status: "accepted",
      $or: [{ requesterId: userId }, { recipientId: userId }],
    })
      .select("requesterId recipientId")
      .lean(),
  ]);
  if (!me || !game) return;
  const prefs = (me as { preferences?: { appearOffline?: boolean; hideActivityFromFriends?: boolean } })
    .preferences;
  if (Boolean(prefs?.appearOffline) || Boolean(prefs?.hideActivityFromFriends)) {
    return;
  }

  const friendIds = friendships.map((f) => {
    const a = String(f.requesterId);
    const b = String(f.recipientId);
    return a === userId ? b : a;
  });
  const friends = await User.find({ _id: { $in: friendIds } })
    .select("preferences")
    .lean();

  await Promise.all(
    friends.map(async (friend) => {
      if (
        (friend as { preferences?: { notifyFriendActivity?: boolean } }).preferences
          ?.notifyFriendActivity === false
      ) {
        return;
      }
      await createFriendLfgNotification({
        recipientId: String(friend._id),
        fromUserId: userId,
        fromUsername: String(me.username || "A friend"),
        gameSlug,
        gameTitle: game.title,
      });
    })
  );
}
