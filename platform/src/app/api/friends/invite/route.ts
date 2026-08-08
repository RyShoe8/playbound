import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import FriendInvite from "@/lib/models/FriendInvite";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { sendFriendRequestBetween } from "@/lib/friends/sendRequest";
import {
  hashInviteToken,
  inviteExpiryDate,
  mintInviteToken,
} from "@/lib/friends/redeemInvites";
import {
  friendInviteEmailHtml,
  friendRequestInviteEmailHtml,
  sendMail,
} from "@/lib/mailer";
import { SITE_URL } from "@/lib/site";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

const bodySchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(200),
});

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email: rawEmail } = bodySchema.parse(await req.json());
    const email = rawEmail.trim().toLowerCase();

    await dbConnect();

    const inviter = await User.findById(userId).select("username email").lean();
    if (!inviter) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (inviter.email?.toLowerCase() === email) {
      return NextResponse.json({ error: "You can’t invite yourself" }, { status: 400 });
    }

    const recentCount = await FriendInvite.countDocuments({
      inviterId: userId,
      createdAt: { $gte: new Date(Date.now() - RATE_WINDOW_MS) },
    });
    // Also count friend requests to existing users roughly via invites + allow 10 deferred;
    // for existing-user path we check a soft rate on FriendInvite only + same hour send via Friend.
    if (recentCount >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many invites this hour. Try again later." },
        { status: 429 }
      );
    }

    const existingUser = await User.findOne({ email }).select("_id username disabled").lean();

    if (existingUser && !existingUser.disabled) {
      const result = await sendFriendRequestBetween(userId, String(existingUser._id));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      const friendsUrl = `${SITE_URL}/login?callbackUrl=${encodeURIComponent("/friends")}`;
      void sendMail(
        email,
        `${inviter.username} wants to be friends on PlayBound`,
        friendRequestInviteEmailHtml(String(inviter.username), friendsUrl)
      ).catch((err) => console.error("friend request invite email failed:", err));

      void saveEvent({
        event: "friend_invite_sent",
        properties: { mode: "existing" },
        userId,
      });

      // Track toward hourly invite limit (same collection as deferred invites).
      void FriendInvite.create({
        inviterId: userId,
        email,
        tokenHash: hashInviteToken(mintInviteToken()),
        status: "accepted",
        friendshipId: result.friendshipId,
        expiresAt: inviteExpiryDate(),
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        mode: "existing",
        message: result.alreadyFriends
          ? "You’re already friends."
          : result.autoAccepted
            ? "You’re now friends."
            : "Friend request sent.",
        friendshipId: result.friendshipId,
      });
    }

    let invite = await FriendInvite.findOne({
      inviterId: userId,
      email,
      status: "pending",
    }).select("+tokenHash");

    const token = mintInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = inviteExpiryDate();

    if (invite) {
      invite.tokenHash = tokenHash;
      invite.expiresAt = expiresAt;
      await invite.save();
    } else {
      invite = await FriendInvite.create({
        inviterId: userId,
        email,
        tokenHash,
        status: "pending",
        expiresAt,
      });
    }

    const signupUrl = `${SITE_URL}/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    void sendMail(
      email,
      `${inviter.username} invited you to PlayBound`,
      friendInviteEmailHtml(String(inviter.username), signupUrl)
    ).catch((err) => console.error("friend invite email failed:", err));

    void saveEvent({
      event: "friend_invite_sent",
      properties: { mode: "deferred" },
      userId,
    });

    return NextResponse.json({
      success: true,
      mode: "deferred",
      message: "Invite sent.",
      inviteId: String(invite._id),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid email" }, { status: 400 });
    }
    console.error("Friend invite error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
