import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import HostingAdminInvite from "@/lib/models/HostingAdminInvite";
import User from "@/lib/models/User";
import { sendMail } from "@/lib/mailer";
import { SITE_URL } from "@/lib/site";

const MAX_ADMINS = 20;
const INVITE_DAYS = 14;
const fail = (error: string, status: 400 | 403 | 404 | 409 | 429 = 400) => ({ error, status });

async function ownedSubscription(ownerId: string) {
  await dbConnect();
  if (!Types.ObjectId.isValid(ownerId)) return null;
  return DedicatedSubscription.findOne({ userId: ownerId, tier: "basic", status: { $ne: "expired" } }).sort({ createdAt: -1 });
}

/** Called only after the user has proved ownership of the email address. */
export async function redeemHostingAdminInvites(email: string, userId: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !Types.ObjectId.isValid(userId)) return 0;
  await dbConnect();
  const user = await User.findById(userId).select({ email: 1, emailVerified: 1, disabled: 1 }).lean();
  if (!user?.emailVerified || user.disabled || user.email?.toLowerCase() !== normalized) return 0;
  const now = new Date();
  const invites = await HostingAdminInvite.find({ email: normalized, status: "pending", expiresAt: { $gt: now } });
  let accepted = 0;
  for (const invite of invites) {
    const result = await DedicatedSubscription.updateOne({
      _id: invite.subscriptionId, userId: { $ne: userId }, "admins.userId": { $ne: userId },
      status: { $ne: "expired" }, "admins.19": { $exists: false },
    }, { $push: { admins: { userId, grantedBy: invite.inviterId, grantedAt: now } } });
    if (result.modifiedCount || await DedicatedSubscription.exists({ _id: invite.subscriptionId, "admins.userId": userId })) {
      invite.status = "accepted";
      invite.acceptedBy = new Types.ObjectId(userId);
      await invite.save();
      accepted++;
    }
  }
  return accepted;
}

export async function listHostingAdmins(ownerId: string) {
  const sub = await ownedSubscription(ownerId);
  if (!sub) return fail("Hosting subscription not found", 404);
  const ids = (sub.admins || []).map((a: { userId: unknown }) => a.userId);
  const [users, invites] = await Promise.all([
    User.find({ _id: { $in: ids } }).select({ username: 1, email: 1 }).lean(),
    HostingAdminInvite.find({ subscriptionId: sub._id, status: "pending", expiresAt: { $gt: new Date() } }).select({ email: 1, expiresAt: 1 }).lean(),
  ]);
  return { admins: users.map((u) => ({ userId: String(u._id), username: u.username, email: u.email })), invites: invites.map((i) => ({ id: String(i._id), email: i.email, expiresAt: i.expiresAt })) };
}

export async function addHostingAdmin(ownerId: string, input: { username?: string; email?: string }) {
  const sub = await ownedSubscription(ownerId);
  if (!sub) return fail("Hosting subscription not found", 404);
  const count = (sub.admins || []).length;
  if (count >= MAX_ADMINS) return fail("This plan already has 20 administrators", 409);
  if (input.username) {
    const user = await User.findOne({ usernameNormalized: input.username.trim().toLowerCase(), emailVerified: true, disabled: { $ne: true } }).select({ _id: 1 }).lean();
    if (!user) return fail("No verified PlayBound user with that name", 404);
    if (String(user._id) === ownerId) return fail("You already own this plan");
    await DedicatedSubscription.updateOne({ _id: sub._id, "admins.userId": { $ne: user._id }, "admins.19": { $exists: false } }, {
      $push: { admins: { userId: user._id, grantedBy: ownerId, grantedAt: new Date() } },
    });
    return { ok: true };
  }
  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fail("Enter a valid email");
  const owner = await User.findById(ownerId).select({ email: 1, username: 1 }).lean();
  if (owner?.email?.toLowerCase() === email) return fail("You already own this plan");
  const recipient = await User.findOne({ email, emailVerified: true, disabled: { $ne: true } }).select({ _id: 1 }).lean();
  if (recipient) {
    const added = await DedicatedSubscription.updateOne({ _id: sub._id, "admins.userId": { $ne: recipient._id }, "admins.19": { $exists: false } }, {
      $push: { admins: { userId: recipient._id, grantedBy: ownerId, grantedAt: new Date() } },
    });
    if (!added.modifiedCount) return fail("That person is already an administrator or the plan is full", 409);
    const url = `${SITE_URL}/login?callbackUrl=${encodeURIComponent("/hosting/servers")}`;
    const inviter = String(owner?.username || "A PlayBound member").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
    void sendMail(email, "You can now manage PlayBound Dedicated servers",
      `<p>${inviter} added you as a PlayBound Dedicated administrator.</p><p><a href="${url}">Manage the servers</a>.</p>`)
      .catch((error) => console.error("hosting administrator notification failed:", error));
    return { ok: true };
  }
  const recent = await HostingAdminInvite.countDocuments({ inviterId: ownerId, createdAt: { $gte: new Date(Date.now() - 3600_000) } });
  if (recent >= 10) return fail("Too many invites this hour", 429);
  const existing = await HostingAdminInvite.findOne({ subscriptionId: sub._id, email, status: "pending" });
  if (existing) return { ok: true };
  const invite = await HostingAdminInvite.create({ subscriptionId: sub._id, inviterId: ownerId, email, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) });
  try {
    const url = `${SITE_URL}/signup?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent("/hosting/servers")}`;
    const inviter = String(owner?.username || "A PlayBound member").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
    await sendMail(email, `${owner?.username || "A PlayBound member"} invited you to manage their game servers`,
      `<p>${inviter} invited you to help manage their PlayBound Dedicated game servers.</p><p><a href="${url}">Create your PlayBound account</a> with this email address, then verify it to accept.</p><p>This invitation expires in 14 days.</p>`);
  } catch {
    await HostingAdminInvite.deleteOne({ _id: invite._id, status: "pending" });
    return fail("Invitation email could not be sent. Please try again.");
  }
  return { ok: true, invited: true };
}

export async function removeHostingAdmin(ownerId: string, input: { userId?: string; inviteId?: string }) {
  const sub = await ownedSubscription(ownerId);
  if (!sub) return fail("Hosting subscription not found", 404);
  if (input.userId && Types.ObjectId.isValid(input.userId)) {
    await DedicatedSubscription.updateOne({ _id: sub._id }, { $pull: { admins: { userId: input.userId } } });
    return { ok: true };
  }
  if (input.inviteId && Types.ObjectId.isValid(input.inviteId)) {
    await HostingAdminInvite.updateOne({ _id: input.inviteId, subscriptionId: sub._id, status: "pending" }, { $set: { status: "cancelled" } });
    return { ok: true };
  }
  return fail("Administrator or invite not found", 404);
}
