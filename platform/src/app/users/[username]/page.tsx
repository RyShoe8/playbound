import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Gamepad2, Globe } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Presence from "@/lib/models/Presence";
import DiscordConnection from "@/lib/models/DiscordConnection";
import Friend from "@/lib/models/Friend";
import { listGames } from "@/lib/catalog";
import { Avatar } from "@/components/ui/bits";
import { ProfileFriendshipActions } from "@/components/friends/ProfileFriendshipActions";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";
import { TelemetryOnce } from "@/components/TelemetryOnce";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: username,
    robots: { index: false, follow: false },
  };
}

export default async function PublicUserProfilePage({ params }: Props) {
  // Per-request by nature: live data, the signed-in viewer, or both.
  // Reads the database before it reads anything request-scoped, which
  // Cache Components will not allow during a prerender.
  await connection();
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);
  const session = await getServerSession(authOptions);

  await dbConnect();
  const user = await User.findOne({
    username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  })
    .select("username image preferences disabled")
    .lean();

  if (!user || user.disabled) notFound();

  const userId = String(user._id);
  const isSelf = session?.user?.id === userId;

  const [presenceRow, discordConn, viewerDiscord, rel, games] = await Promise.all([
    Presence.findOne({ userId: user._id }).lean(),
    DiscordConnection.findOne({ userId: user._id }).select("_id").lean(),
    session?.user?.id
      ? DiscordConnection.findOne({ userId: session.user.id }).select("_id").lean()
      : Promise.resolve(null),
    session?.user?.id && !isSelf
      ? Friend.findOne({
          $or: [
            { requesterId: session.user.id, recipientId: userId },
            { requesterId: userId, recipientId: session.user.id },
          ],
        }).lean()
      : Promise.resolve(null),
    listGames({ includeTesting: true }),
  ]);

  const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
  const rawPresence = presenceRow
    ? {
        status: presenceRow.status,
        currentGameId: presenceRow.currentGameId,
        currentGameTitle: presenceRow.currentGameId
          ? titleBySlug.get(presenceRow.currentGameId) || presenceRow.currentGameId
          : null,
        currentEditionId: presenceRow.currentEditionId,
        currentPage: presenceRow.currentPage,
        platform: presenceRow.platform,
      }
    : { status: "offline" as const };

  const appearOffline = Boolean(user.preferences?.appearOffline);
  // Own profile shows real status; others see masked.
  const presence = isSelf ? rawPresence : maskPresenceForOthers(rawPresence as any, appearOffline);

  let friendshipStatus: "none" | "outgoing_request" | "incoming_request" | "friends" | "blocked" =
    "none";
  let friendshipId: string | null = null;
  let isBlocker = false;
  if (rel) {
    friendshipId = String(rel._id);
    if (rel.status === "accepted") friendshipStatus = "friends";
    else if (rel.status === "blocked") {
      friendshipStatus = "blocked";
      isBlocker = rel.requesterId.toString() === session?.user?.id;
    } else if (rel.status === "pending") {
      friendshipStatus =
        rel.requesterId.toString() === session?.user?.id ? "outgoing_request" : "incoming_request";
    }
  }

  const activity =
    presence.status === "playing" && presence.currentGameId ? (
      <p className="mt-2 flex items-center gap-2 text-sm text-primary">
        <Gamepad2 className="size-4" />
        Playing {presence.currentGameTitle || presence.currentGameId}
        {presence.currentGameId ? (
          <Link href={`/games/${presence.currentGameId}`} className="font-bold underline-offset-2 hover:underline">
            View Game
          </Link>
        ) : null}
      </p>
    ) : presence.status !== "offline" ? (
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Globe className="size-4" />
        Online on PlayBound
      </p>
    ) : (
      <p className="mt-2 text-sm text-muted-foreground">Offline</p>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <TelemetryOnce event="friend_profile_viewed" properties={{ username: user.username }} />
      <div className="flex items-start gap-4">
        <Avatar name={user.username} hue={265} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">{user.username}</h1>
          {activity}
          {discordConn ? (
            <p className="mt-1 text-xs text-muted-foreground">Discord connected</p>
          ) : null}
        </div>
      </div>

      {isSelf ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/profile"
            className="inline-flex h-10 items-center rounded-full border border-border bg-secondary px-5 text-sm font-bold"
          >
            Edit profile
          </Link>
          <Link
            href="/friends"
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Friends
          </Link>
        </div>
      ) : (
        <ProfileFriendshipActions
          userId={userId}
          username={user.username}
          friendshipId={friendshipId}
          initialStatus={friendshipStatus}
          isBlocker={isBlocker}
          discordLinked={Boolean(discordConn)}
          viewerHasDiscord={Boolean(viewerDiscord)}
        />
      )}
    </div>
  );
}
