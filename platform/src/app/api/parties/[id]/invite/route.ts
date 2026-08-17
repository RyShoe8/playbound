import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import { checkInviteRecipient, sendPlayInvite } from "@/lib/playTogether/invites";
import { createPartyInviteNotification } from "@/lib/playTogether/notify";
import { getGame } from "@/lib/catalog";
import { normalizePartyName } from "@/lib/playTogether/types";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/parties/:id/invite — invite friends to the party. */
export async function POST(req: Request, ctx: RouteContext) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const friendIds: string[] = Array.isArray(body.friendIds) ? body.friendIds : [];

    if (friendIds.length === 0) {
      return NextResponse.json({ error: "No friends to invite" }, { status: 400 });
    }
    if (friendIds.length > 20) {
      return NextResponse.json({ error: "Too many invites at once" }, { status: 400 });
    }

    await dbConnect();
    const party = await Party.findById(id).lean();
    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }
    if (party.status === "ended") {
      return NextResponse.json({ error: "Party has ended" }, { status: 400 });
    }

    const isMember = (party.members as Array<{ userId: unknown }>).some(
      (m) => String(m.userId) === userId
    );
    if (!isMember) {
      return NextResponse.json({ error: "You are not in this party" }, { status: 403 });
    }

    const gameSlug = String(party.gameSlug || "").trim();
    const [sender, game] = await Promise.all([
      User.findById(userId).select("username").lean(),
      gameSlug ? getGame(gameSlug, { includeTesting: true }) : Promise.resolve(null),
    ]);
    const senderUsername = String(sender?.username || "A friend");
    const gameTitle = game?.title || null;
    const partyName = normalizePartyName(party.name);
    const memberCount = (party.members as unknown[]).length;

    const results = await Promise.all(
      friendIds.map(async (recipientId: string) => {
        try {
          const allowed = await checkInviteRecipient(userId, recipientId);
          if (!("ok" in allowed)) {
            return {
              recipientId,
              status: allowed.status,
              error: allowed.error,
            };
          }

          await createPartyInviteNotification({
            recipientId,
            senderId: userId,
            senderUsername,
            partyId: String(party._id),
            gameSlug: gameSlug || null,
            gameTitle,
            partyName,
            memberCount,
          });

          if (gameSlug && game) {
            const inviteResult = await sendPlayInvite({
              senderId: userId,
              recipientId,
              gameSlug,
              editionSlug: (party.editionSlug as string) || null,
              partyId: String(party._id),
            });
            if (inviteResult.status !== 201 && inviteResult.status !== 409) {
              return {
                recipientId,
                status: inviteResult.status,
                error: "error" in inviteResult ? inviteResult.error : undefined,
              };
            }
          }

          return { recipientId, status: 201 };
        } catch {
          return {
            recipientId,
            status: 500,
            error: "Failed to send invite",
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/parties/[id]/invite failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
