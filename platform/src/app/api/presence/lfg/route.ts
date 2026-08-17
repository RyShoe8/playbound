import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getGame } from "@/lib/catalog";
import { LFG_TTL_MS } from "@/lib/playTogether/types";
import { createFriendLfgNotification } from "@/lib/playTogether/notify";
import { findInvolvedFriendIds } from "@/lib/playTogether/activityNotify";

/** Enough to say "any of these", short of a wishlist nobody reads. */
const MAX_LFG_GAMES = 6;

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      enabled?: boolean;
      gameSlug?: string | null;
      gameSlugs?: string[] | null;
    };
    const enabled = Boolean(body.enabled);
    await dbConnect();

    if (!enabled) {
      await Presence.findOneAndUpdate(
        { userId },
        {
          $set: {
            lookingForPlayersUntil: null,
            lookingForPlayersGameId: null,
            lookingForPlayersGameIds: [],
          },
        },
        { upsert: true }
      );
      return NextResponse.json({ active: false, expiresAt: null, gameSlug: null, gameSlugs: [] });
    }

    /*
     * Preferred games are a set now — "I'd play any of these" is the useful
     * signal for finding a party. `gameSlug` is still accepted so older
     * launcher builds keep working, and the singular field is kept in sync
     * with the first entry for every existing reader of it.
     */
    const requested = Array.isArray(body.gameSlugs)
      ? body.gameSlugs
      : body.gameSlug
      ? [body.gameSlug]
      : [];
    const gameSlugs = [
      ...new Set(
        requested
          .map((s) => String(s || "").trim())
          .filter(Boolean)
          .slice(0, MAX_LFG_GAMES)
      ),
    ];

    for (const slug of gameSlugs) {
      const game = await getGame(slug, { includeTesting: true });
      if (!game) {
        return NextResponse.json({ error: `Game not found: ${slug}` }, { status: 404 });
      }
    }

    const primarySlug = gameSlugs[0] || null;
    const expiresAt = new Date(Date.now() + LFG_TTL_MS);
    await Presence.findOneAndUpdate(
      { userId },
      {
        $set: {
          lookingForPlayersUntil: expiresAt,
          lookingForPlayersGameId: primarySlug,
          lookingForPlayersGameIds: gameSlugs,
          lastHeartbeat: new Date(),
        },
        $setOnInsert: { userId, status: "online", startedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    ).lean();

    // Notify friends (soft-fail). One notification per preferred game would be
    // spam, so friends hear about the first pick only.
    void notifyFriendsLfg(userId, primarySlug).catch(() => undefined);

    return NextResponse.json({
      active: true,
      expiresAt,
      gameSlug: primarySlug,
      gameSlugs,
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
  const [friends, involved] = await Promise.all([
    User.find({ _id: { $in: friendIds } })
      .select("preferences")
      .lean(),
    // Party members only: a friend already in the game is precisely who wants
    // to hear that someone is looking for players.
    findInvolvedFriendIds(userId, friendIds),
  ]);

  await Promise.all(
    friends.map(async (friend) => {
      if (
        (friend as { preferences?: { notifyFriendActivity?: boolean } }).preferences
          ?.notifyFriendActivity === false
      ) {
        return;
      }
      if (involved.has(String(friend._id))) return;
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
