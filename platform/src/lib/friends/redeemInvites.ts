import crypto from "crypto";
import dbConnect from "@/lib/db";
import FriendInvite from "@/lib/models/FriendInvite";
import { sendFriendRequestBetween } from "@/lib/friends/sendRequest";

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function mintInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Redeem all pending email invites for this address into friend requests. */
export async function redeemFriendInvitesForEmail(
  email: string,
  newUserId: string
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !newUserId) return 0;

  await dbConnect();
  const now = new Date();

  await FriendInvite.updateMany(
    { email: normalized, status: "pending", expiresAt: { $lt: now } },
    { $set: { status: "expired" } }
  );

  const invites = await FriendInvite.find({
    email: normalized,
    status: "pending",
    expiresAt: { $gte: now },
  });

  let redeemed = 0;
  for (const invite of invites) {
    const inviterId = String(invite.inviterId);
    if (inviterId === newUserId) {
      invite.status = "cancelled";
      await invite.save();
      continue;
    }

    const result = await sendFriendRequestBetween(inviterId, newUserId, { skipTelemetry: true });
    if (result.ok) {
      invite.status = "accepted";
      invite.friendshipId = result.friendshipId as never;
      await invite.save();
      redeemed += 1;
    } else if (result.status === 403) {
      invite.status = "cancelled";
      await invite.save();
    }
  }

  return redeemed;
}

export function inviteExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_MS);
}
