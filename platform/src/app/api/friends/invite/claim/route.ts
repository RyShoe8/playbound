import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import FriendInvite from "@/lib/models/FriendInvite";
import { getFriendsUserId } from "@/lib/friendsAuth";
import {
  hashInviteToken,
  redeemFriendInvitesForEmail,
} from "@/lib/friends/redeemInvites";
import User from "@/lib/models/User";
import { sendFriendRequestBetween } from "@/lib/friends/sendRequest";

const bodySchema = z.object({
  token: z.string().min(16).max(200),
});

/**
 * Claim a specific invite token after signup/login (fallback if email redeem missed).
 */
export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = bodySchema.parse(await req.json());
    await dbConnect();

    const user = await User.findById(userId).select("email emailVerified").lean();
    if (!user?.email) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Prefer email-based redeem (covers all pending invites).
    const byEmail = await redeemFriendInvitesForEmail(String(user.email), userId);

    const tokenHash = hashInviteToken(token);
    const invite = await FriendInvite.findOne({
      tokenHash,
      status: "pending",
    }).select("+tokenHash");

    if (invite) {
      if (invite.expiresAt.getTime() < Date.now()) {
        invite.status = "expired";
        await invite.save();
      } else if (String(invite.inviterId) !== userId) {
        const result = await sendFriendRequestBetween(String(invite.inviterId), userId);
        if (result.ok) {
          invite.status = "accepted";
          invite.friendshipId = result.friendshipId as never;
          await invite.save();
        }
      }
    }

    return NextResponse.json({ success: true, redeemed: byEmail });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("Invite claim error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
