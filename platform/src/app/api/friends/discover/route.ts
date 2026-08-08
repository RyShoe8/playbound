import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Friend from "@/lib/models/Friend";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { listGames } from "@/lib/catalog";
import { getFriendsUserId } from "@/lib/friendsAuth";

/**
 * GET /api/friends/discover?game=<slug>  |  ?genre=<Genre>
 *
 * Find players by what they have in their library, which the username search
 * cannot answer — that only matches on username.
 *
 * Only the games shared with the requester are returned, never a person's full
 * library: the question being answered is "who else plays this", so the rest of
 * what someone owns is not this endpoint's business to reveal.
 */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const game = searchParams.get("game")?.trim() || "";
  const genre = searchParams.get("genre")?.trim() || "";

  if (!game && !genre) {
    return NextResponse.json({ users: [] });
  }

  try {
    await dbConnect();

    // A genre is expanded to the slugs it covers, so both modes reduce to the
    // same "library contains one of these slugs" query.
    let slugs: string[];
    if (game) {
      slugs = [game];
    } else {
      const all = await listGames();
      slugs = all.filter((g) => g.genres.includes(genre as never)).map((g) => g.slug);
      if (slugs.length === 0) return NextResponse.json({ users: [] });
    }

    const entries = await LibraryEntry.find({
      gameSlug: { $in: slugs },
      userId: { $ne: userId },
      $or: [{ installed: true }, { saved: true }],
    })
      .select("userId gameSlug")
      .limit(500)
      .lean();

    if (entries.length === 0) return NextResponse.json({ users: [] });

    // Collapse to one row per person, remembering which titles matched.
    const sharedByUser = new Map<string, Set<string>>();
    for (const e of entries) {
      const key = String(e.userId);
      if (!sharedByUser.has(key)) sharedByUser.set(key, new Set());
      sharedByUser.get(key)!.add(String(e.gameSlug));
    }

    const userIds = [...sharedByUser.keys()].slice(0, 40);
    const [users, friendships, catalog] = await Promise.all([
      User.find({ _id: { $in: userIds } })
        .select("username image connectedAccounts")
        .lean(),
      Friend.find({
        $or: [
          { requesterId: userId, recipientId: { $in: userIds } },
          { requesterId: { $in: userIds }, recipientId: userId },
        ],
      }).lean(),
      listGames(),
    ]);

    // Mirrors the shape and status vocabulary of /api/friends/search so the
    // client can render both result sets with one component.
    const statusById = new Map<string, string>();
    for (const f of friendships) {
      const other =
        String(f.requesterId) === userId ? String(f.recipientId) : String(f.requesterId);
      const isRequester = String(f.requesterId) === userId;
      statusById.set(
        other,
        f.status === "accepted"
          ? "friends"
          : f.status === "blocked"
            ? "blocked"
            : isRequester
              ? "outgoing_request"
              : "incoming_request"
      );
    }

    const titleBySlug = new Map(catalog.map((g) => [g.slug, g.title]));

    const results = users
      .map((u) => {
        const id = String(u._id);
        const shared = [...(sharedByUser.get(id) ?? [])].map(
          (slug) => titleBySlug.get(slug) ?? slug
        );
        return {
          id: u._id,
          username: u.username,
          image: u.image,
          discordLinked: Boolean(
            (u as { connectedAccounts?: { discord?: { discordUserId?: string } } })
              .connectedAccounts?.discord?.discordUserId
          ),
          friendStatus: statusById.get(id) ?? "none",
          sharedGames: shared.slice(0, 4),
          sharedCount: shared.length,
        };
      })
      .filter((u) => u.friendStatus !== "blocked")
      // Most overlap first — the strongest reason to connect.
      .sort((a, b) => b.sharedCount - a.sharedCount);

    return NextResponse.json({ users: results });
  } catch (error) {
    console.error("Error discovering players:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
