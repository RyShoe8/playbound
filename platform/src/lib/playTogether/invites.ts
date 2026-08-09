import dbConnect from "@/lib/db";
import PlayInvite from "@/lib/models/PlayInvite";
import Friend from "@/lib/models/Friend";
import User from "@/lib/models/User";
import { getGame } from "@/lib/catalog";
import { PLAY_INVITE_TTL_MS } from "@/lib/playTogether/types";
import {
  createPlayInviteNotification,
  createPlayInviteResponseNotification,
} from "@/lib/playTogether/notify";
import { nextInviteStatus } from "@/lib/playTogether/inviteRules";
import type { PlayInviteStatus } from "@/lib/playTogether/types";

async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await Friend.findOne({
    status: "accepted",
    $or: [
      { requesterId: a, recipientId: b },
      { requesterId: b, recipientId: a },
    ],
  })
    .select("_id")
    .lean();
  return Boolean(row);
}

export async function sendPlayInvite(opts: {
  senderId: string;
  recipientId: string;
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
}) {
  await dbConnect();
  if (opts.senderId === opts.recipientId) {
    return { error: "Cannot invite yourself", status: 400 as const };
  }
  if (!(await areFriends(opts.senderId, opts.recipientId))) {
    return { error: "You can only invite friends", status: 403 as const };
  }

  const recipient = await User.findById(opts.recipientId).select("preferences username").lean();
  if (!recipient) return { error: "User not found", status: 404 as const };
  const allow =
    (recipient as { preferences?: { allowPlayInvites?: boolean } }).preferences?.allowPlayInvites !==
    false;
  if (!allow) return { error: "This user is not accepting play invites", status: 403 as const };

  const game = await getGame(opts.gameSlug, { includeTesting: true });
  if (!game) return { error: "Game not found", status: 404 as const };

  const now = new Date();
  const existing = await PlayInvite.findOne({
    senderId: opts.senderId,
    recipientId: opts.recipientId,
    gameSlug: opts.gameSlug,
    status: "pending",
    expiresAt: { $gt: now },
  }).lean();
  if (existing) {
    return { error: "Invite already pending", status: 409 as const, inviteId: String(existing._id) };
  }

  const invite = await PlayInvite.create({
    senderId: opts.senderId,
    recipientId: opts.recipientId,
    gameSlug: opts.gameSlug,
    editionSlug: opts.editionSlug || null,
    modSlug: opts.modSlug || null,
    status: "pending",
    expiresAt: new Date(now.getTime() + PLAY_INVITE_TTL_MS),
  });

  const sender = await User.findById(opts.senderId).select("username").lean();
  await createPlayInviteNotification({
    recipientId: opts.recipientId,
    senderId: opts.senderId,
    senderUsername: String(sender?.username || "A friend"),
    inviteId: String(invite._id),
    gameSlug: opts.gameSlug,
    gameTitle: game.title,
  });

  return { invite: serializeInvite(invite), status: 201 as const };
}

export async function respondPlayInvite(opts: {
  inviteId: string;
  userId: string;
  action: "accept" | "decline" | "cancel";
}) {
  await dbConnect();
  const invite = await PlayInvite.findById(opts.inviteId);
  if (!invite) return { error: "Invite not found", status: 404 as const };

  const now = new Date();
  const transition = nextInviteStatus(
    invite.status as PlayInviteStatus,
    opts.action === "cancel" ? "cancel" : opts.action,
    now,
    new Date(invite.expiresAt)
  );
  if (transition.status === "expired" && invite.status === "pending") {
    invite.status = "expired";
    invite.respondedAt = now;
    await invite.save();
    return { error: "Invite expired", status: 410 as const };
  }
  if (transition.error || invite.status !== "pending") {
    return { error: transition.error || "Invite is no longer pending", status: 409 as const };
  }

  if (opts.action === "cancel") {
    if (String(invite.senderId) !== opts.userId) {
      return { error: "Only the sender can cancel", status: 403 as const };
    }
    invite.status = "cancelled";
    invite.respondedAt = now;
    await invite.save();
    return { invite: serializeInvite(invite), status: 200 as const };
  }

  if (String(invite.recipientId) !== opts.userId) {
    return { error: "Only the recipient can respond", status: 403 as const };
  }

  invite.status = transition.status;
  invite.respondedAt = now;
  await invite.save();

  const [recipient, game] = await Promise.all([
    User.findById(opts.userId).select("username").lean(),
    getGame(invite.gameSlug, { includeTesting: true }),
  ]);
  await createPlayInviteResponseNotification({
    recipientId: String(invite.senderId),
    fromUserId: opts.userId,
    fromUsername: String(recipient?.username || "A friend"),
    inviteId: String(invite._id),
    gameSlug: invite.gameSlug,
    gameTitle: game?.title || invite.gameSlug,
    accepted: opts.action === "accept",
  });

  return { invite: serializeInvite(invite), status: 200 as const };
}

export async function listPlayInvitesForUser(userId: string) {
  await dbConnect();
  const now = new Date();
  await PlayInvite.updateMany(
    { status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired", respondedAt: now } }
  );

  const rows = await PlayInvite.find({
    $or: [{ senderId: userId }, { recipientId: userId }],
    status: { $in: ["pending", "accepted"] },
    createdAt: { $gte: new Date(now.getTime() - PLAY_INVITE_TTL_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(String(r.senderId));
    userIds.add(String(r.recipientId));
  }
  const users = await User.find({ _id: { $in: [...userIds] } })
    .select("username")
    .lean();
  const nameById = new Map(users.map((u) => [String(u._id), String(u.username || "Player")]));

  return rows.map((r) => ({
    ...serializeInvite(r),
    senderUsername: nameById.get(String(r.senderId)) || "Player",
    recipientUsername: nameById.get(String(r.recipientId)) || "Player",
    direction: String(r.recipientId) === userId ? "incoming" : "outgoing",
  }));
}

export async function expireStalePlayInvites(now = new Date()) {
  await dbConnect();
  const res = await PlayInvite.updateMany(
    { status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired", respondedAt: now } }
  );
  return { expired: res.modifiedCount || 0 };
}

function serializeInvite(inv: {
  _id: unknown;
  senderId: unknown;
  recipientId: unknown;
  gameSlug: string;
  editionSlug?: string | null;
  modSlug?: string | null;
  status: string;
  expiresAt: Date;
  respondedAt?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: String(inv._id),
    senderId: String(inv.senderId),
    recipientId: String(inv.recipientId),
    gameSlug: inv.gameSlug,
    editionSlug: inv.editionSlug || null,
    modSlug: inv.modSlug || null,
    status: inv.status,
    expiresAt: inv.expiresAt,
    respondedAt: inv.respondedAt || null,
    createdAt: inv.createdAt || null,
  };
}
