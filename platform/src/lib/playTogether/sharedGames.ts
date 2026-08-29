import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import Presence from "@/lib/models/Presence";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import { listGames, listGamesForJoin } from "@/lib/catalog";
import { isMultiplayerGame } from "@/lib/playTogether/multiplayer";
import { resolveJoinCapability } from "@/lib/playTogether/joinCapability";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";

export type SharedPlayGame = {
  slug: string;
  title: string;
  youHaveAccess: boolean;
  friendsWithAccess: { id: string; username: string }[];
  playingNow: { id: string; username: string }[];
  lookingForPlayers: { id: string; username: string }[];
  join: ReturnType<typeof resolveJoinCapability>;
  rank: number;
};

async function acceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await Friend.find({
    $or: [{ requesterId: userId }, { recipientId: userId }],
    status: "accepted",
  })
    .select("requesterId recipientId")
    .lean();
  /*
   * The viewer can never be their own friend. Picking "the other side" of the
   * pair relies on one side matching userId exactly; if that comparison ever
   * fails — an id that stringifies differently, or a self-referential row that
   * predates the guard in sendFriendRequestBetween — the ternary hands back the
   * viewer's own id and they appear in their own friends list, which is what
   * the homepage was showing. Filtering here holds the invariant no matter
   * which of those is true.
   */
  return friendships
    .map((f) => {
      const a = String(f.requesterId);
      const b = String(f.recipientId);
      return a === userId ? b : a;
    })
    .filter((id) => id !== userId);
}

/** Games both you and ≥1 friend have in library, preferring multiplayer + live activity. */
export async function listSharedPlayGames(userId: string, limit = 12): Promise<SharedPlayGame[]> {
  await dbConnect();
  const friendIds = await acceptedFriendIds(userId);
  if (friendIds.length === 0) return [];

  const [myLib, friendLib, games, friends, presences] = await Promise.all([
    LibraryEntry.find({ userId, installed: true }).select("gameSlug").lean(),
    LibraryEntry.find({ userId: { $in: friendIds }, installed: true })
      .select("userId gameSlug")
      .lean(),
    listGames({ includeTesting: true }),
    User.find({ _id: { $in: friendIds } })
      .select("username preferences")
      .lean(),
    Presence.find({ userId: { $in: friendIds } }).lean(),
  ]);

  const mySlugs = new Set(myLib.map((r) => String(r.gameSlug)));
  const friendsById = new Map(
    friends.map((u) => [
      String(u._id),
      {
        username: String(u.username || "Player"),
        appearOffline: Boolean((u as { preferences?: { appearOffline?: boolean } }).preferences?.appearOffline),
        hideActivity: Boolean(
          (u as { preferences?: { hideActivityFromFriends?: boolean } }).preferences
            ?.hideActivityFromFriends
        ),
      },
    ])
  );

  const now = Date.now();
  const presenceByUser = new Map(
    presences.map((p) => {
      const uid = String(p.userId);
      const meta = friendsById.get(uid);
      const raw = {
        status: String(p.status || "offline"),
        currentGameId: p.currentGameId || null,
        currentEditionId: p.currentEditionId || null,
        lookingForPlayersUntil: p.lookingForPlayersUntil
          ? new Date(p.lookingForPlayersUntil).getTime()
          : null,
        lookingForPlayersGameId: p.lookingForPlayersGameId || null,
      };
      const masked = maskPresenceForOthers(
        {
          status: raw.status,
          currentGameId: raw.currentGameId,
          currentEditionId: raw.currentEditionId,
        },
        Boolean(meta?.appearOffline),
        Boolean(meta?.hideActivity)
      );
      return [
        uid,
        {
          ...masked,
          lookingForPlayersUntil: raw.lookingForPlayersUntil,
          lookingForPlayersGameId: raw.lookingForPlayersGameId,
        },
      ] as const;
    })
  );

  const accessBySlug = new Map<string, Set<string>>();
  for (const row of friendLib) {
    const slug = String(row.gameSlug);
    if (!mySlugs.has(slug)) continue;
    const uid = String(row.userId);
    if (!accessBySlug.has(slug)) accessBySlug.set(slug, new Set());
    accessBySlug.get(slug)!.add(uid);
  }

  const gameBySlug = new Map(games.map((g) => [g.slug, g]));
  const out: SharedPlayGame[] = [];

  for (const [slug, friendSet] of accessBySlug) {
    const game = gameBySlug.get(slug);
    if (!game || !isMultiplayerGame(game)) continue;

    const friendsWithAccess = [...friendSet]
      .map((id) => {
        const f = friendsById.get(id);
        return f ? { id, username: f.username } : null;
      })
      .filter(Boolean) as { id: string; username: string }[];

    if (friendsWithAccess.length === 0) continue;

    const playingNow: { id: string; username: string }[] = [];
    const lookingForPlayers: { id: string; username: string }[] = [];

    for (const f of friendsWithAccess) {
      const p = presenceByUser.get(f.id);
      if (!p) continue;
      if (p.status === "playing" && p.currentGameId === slug) {
        playingNow.push(f);
      }
      if (
        p.lookingForPlayersUntil &&
        p.lookingForPlayersUntil > now &&
        (p.lookingForPlayersGameId === slug || !p.lookingForPlayersGameId)
      ) {
        lookingForPlayers.push(f);
      }
    }

    const lead = playingNow[0] || lookingForPlayers[0];
    const join = resolveJoinCapability({
      game,
      friendStatus: playingNow.length ? "playing" : "online",
      friendGameId: slug,
    });

    let rank = 0;
    if (playingNow.length) rank += 1000 + playingNow.length * 10;
    if (lookingForPlayers.length) rank += 500 + lookingForPlayers.length * 5;
    rank += friendsWithAccess.length;
    if (lead) rank += 1;

    out.push({
      slug,
      title: game.title,
      youHaveAccess: true,
      friendsWithAccess,
      playingNow,
      lookingForPlayers,
      join,
      rank,
    });
  }

  out.sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title));
  return out.slice(0, limit);
}

export type SharedLibraryGame = { slug: string; title: string };

/** Installed games you and each friend both have, keyed by friend user id. */
export async function listSharedLibraryByFriend(
  userId: string,
  friendIds: string[]
): Promise<Record<string, SharedLibraryGame[]>> {
  const out: Record<string, SharedLibraryGame[]> = {};
  if (friendIds.length === 0) return out;

  await dbConnect();
  const [myLib, friendLib, games] = await Promise.all([
    LibraryEntry.find({ userId, installed: true }).select("gameSlug").lean(),
    LibraryEntry.find({ userId: { $in: friendIds }, installed: true })
      .select("userId gameSlug")
      .lean(),
    // Only slug -> title is read below, and this is reached from the friends
    // list on every party poll.
    listGamesForJoin(),
  ]);

  const mySlugs = new Set(myLib.map((r) => String(r.gameSlug)));
  const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
  const byFriend = new Map<string, SharedLibraryGame[]>();

  for (const row of friendLib) {
    const slug = String(row.gameSlug);
    if (!mySlugs.has(slug)) continue;
    const title = titleBySlug.get(slug);
    if (!title) continue;
    const uid = String(row.userId);
    const list = byFriend.get(uid) || [];
    if (!list.some((g) => g.slug === slug)) list.push({ slug, title });
    byFriend.set(uid, list);
  }

  for (const [id, gamesForFriend] of byFriend) {
    gamesForFriend.sort((a, b) => a.title.localeCompare(b.title));
    out[id] = gamesForFriend;
  }
  return out;
}
