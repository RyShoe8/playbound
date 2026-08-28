import dbConnect from "@/lib/db";
import Friend from "@/lib/models/Friend";

/**
 * Pending friend requests in both directions.
 *
 * Lifted out of the /api/friends/requests route so /api/party-sync can
 * compose it without a second HTTP hop. That route is now a thin wrapper, so
 * there is exactly one implementation and the two cannot drift.
 */

type PopulatedUser = {
  _id?: unknown;
  username?: string;
  image?: string | null;
  connectedAccounts?: { discord?: { discordUserId?: string | null } | null } | null;
};

export type FriendRequestUser = {
  id: unknown;
  username: string;
  image: string | null;
  discordLinked: boolean;
};

export type FriendRequestRow = {
  id: unknown;
  user: FriendRequestUser;
  createdAt: unknown;
};

export type FriendRequests = {
  incoming: FriendRequestRow[];
  outgoing: FriendRequestRow[];
};

function formatUser(userDoc: PopulatedUser | null | undefined): FriendRequestUser {
  if (!userDoc || !userDoc._id) {
    return { id: "", username: "Unknown", image: null, discordLinked: false };
  }
  return {
    id: userDoc._id,
    username: userDoc.username ?? "Unknown",
    image: userDoc.image ?? null,
    discordLinked: Boolean(userDoc.connectedAccounts?.discord?.discordUserId),
  };
}

export async function listFriendRequests(userId: string): Promise<FriendRequests> {
  await dbConnect();

  const [incomingDocs, outgoingDocs] = await Promise.all([
    Friend.find({ recipientId: userId, status: "pending" })
      .populate({ path: "requesterId", select: "username image connectedAccounts" })
      .lean(),
    Friend.find({ requesterId: userId, status: "pending" })
      .populate({ path: "recipientId", select: "username image connectedAccounts" })
      .lean(),
  ]);

  return {
    incoming: incomingDocs.map((doc) => ({
      id: doc._id,
      user: formatUser(doc.requesterId as PopulatedUser),
      createdAt: doc.createdAt,
    })),
    outgoing: outgoingDocs.map((doc) => ({
      id: doc._id,
      user: formatUser(doc.recipientId as PopulatedUser),
      createdAt: doc.createdAt,
    })),
  };
}
