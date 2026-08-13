import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import User from "@/lib/models/User";
import { sendPlayInvite } from "@/lib/playTogether/invites";
import {
  createPartyInviteNotification,
} from "@/lib/playTogether/notify";
import { getGame } from "@/lib/catalog";

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

    // Verify the sender is a party member.
    const isMember = (party.members as Array<{ userId: unknown }>).some(
      (m) => String(m.userId) === userId
    );
    if (!isMember) {
      return NextResponse.json({ error: "You are not in this party" }, { status: 403 });
    }

    const [sender, game] = await Promise.all([
      User.findById(userId).select("username").lean(),
      getGame(String(party.gameSlug), { includeTesting: true }),
    ]);
    const senderUsername = String(sender?.username || "A friend");
    const gameTitle = game?.title || String(party.gameSlug);
    const memberCount = (party.members as unknown[]).length;

    const results = await Promise.all(
      friendIds.map(async (recipientId: string) => {
        try {
          // Send a play invite with party context.
          const inviteResult = await sendPlayInvite({
            senderId: userId,
            recipientId,
            gameSlug: String(party.gameSlug),
            editionSlug: (party.editionSlug as string) || null,
            partyId: String(party._id),
          });

          // Also send party-specific notification.
          if (inviteResult.status === 201) {
            await createPartyInviteNotification({
              recipientId,
              senderId: userId,
              senderUsername,
              partyId: String(party._id),
              gameSlug: String(party.gameSlug),
              gameTitle,
              memberCount,
            });
          }

          return {
            recipientId,
            status: inviteResult.status,
            error: "error" in inviteResult ? inviteResult.error : undefined,
          };
        } catch (err) {
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
