"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore, type FriendUser } from "@/stores/friendsStore";
import { AddFriends } from "@/components/friends/AddFriends";
import { FriendInviteClaim } from "@/components/friends/FriendInviteClaim";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, LogIn, UserMinus } from "lucide-react";
import Link from "next/link";
import { telemetry } from "@/lib/telemetry";

function FriendCard({
  friend,
  subtitle,
  playing,
  offline,
  onRemove,
}: {
  friend: FriendUser;
  subtitle: ReactNode;
  playing?: boolean;
  offline?: boolean;
  onRemove: (id: string) => void;
}) {
  const gameSlug = friend.presence.currentGameId;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 ${
        offline ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar name={friend.username} hue={265} size="md" />
          {playing || !offline ? (
            <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-card">
              <span
                className={`size-2.5 rounded-full ${playing ? "bg-violet-500" : "bg-emerald-500"}`}
              />
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            <Link
              href={`/users/${encodeURIComponent(friend.username)}`}
              className="hover:underline"
            >
              {friend.username}
            </Link>
            {friend.discordLinked ? (
              <span
                className="inline-block size-2 rounded-full bg-[#5865F2]"
                title="Discord linked"
              />
            ) : null}
          </p>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {playing && gameSlug ? (
          <Link
            href={`/games/${encodeURIComponent(gameSlug)}`}
            className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:brightness-110"
            onClick={() =>
              telemetry.track("friend_view_game_clicked", { gameSlug, friendId: friend.id })
            }
          >
            View Game
          </Link>
        ) : null}
        <button
          type="button"
          title="Remove friend"
          className="rounded-md border border-border bg-secondary px-2 py-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (confirm(`Remove ${friend.username}?`)) onRemove(friend.id);
          }}
        >
          <UserMinus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function FriendsSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold">
        {title} - {count}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function FriendsView({
  games,
  genres,
}: {
  games: { slug: string; title: string }[];
  genres: string[];
}) {
  const { status } = useSession();
  const [addOpen, setAddOpen] = useState(false);
  const [appearOffline, setAppearOffline] = useState(false);
  const [appearBusy, setAppearBusy] = useState(false);
  const {
    playingFriends,
    onlineFriends,
    offlineFriends,
    incomingRequests,
    outgoingRequests,
    startPolling,
    stopPolling,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
  } = useFriendsStore();

  useEffect(() => {
    if (status === "authenticated") {
      startPolling(30000);
      telemetry.track("friends_page_viewed", {});
      void fetch("/api/presence/visibility")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setAppearOffline(Boolean(data.appearOffline));
        })
        .catch(() => {});
    }
    return () => stopPolling();
  }, [status, startPolling, stopPolling]);

  async function toggleAppearOffline() {
    const next = !appearOffline;
    setAppearBusy(true);
    try {
      const res = await fetch("/api/presence/visibility", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appearOffline: next }),
      });
      if (res.ok) setAppearOffline(next);
    } finally {
      setAppearBusy(false);
    }
  }

  if (status === "loading") {
    return <div className="animate-pulse text-muted-foreground">Loading friends...</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">Sign in to view and manage your friends.</p>
        <Link
          href="/login?callbackUrl=/friends"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <LogIn className="size-4" />
          Sign In
        </Link>
      </div>
    );
  }

  const hasPending = incomingRequests.length > 0 || outgoingRequests.length > 0;
  const hasFriends =
    playingFriends.length + onlineFriends.length + offlineFriends.length > 0;

  return (
    <div className="space-y-5">
      <FriendInviteClaim />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Friends</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See who&apos;s playing and manage friend requests.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={appearBusy}
            onClick={() => void toggleAppearOffline()}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-60"
            title="Appear offline so friends don’t see you as online or playing"
          >
            {appearBusy ? "Saving…" : appearOffline ? "Go online" : "Appear offline"}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80"
          >
            {addOpen ? "Close" : "Add Friend"}
          </button>
        </div>
      </div>

      {addOpen ? (
        <AddFriends games={games} genres={genres} />
      ) : null}

      <div className="space-y-6">
        {incomingRequests.length > 0 ? (
          <FriendsSection title="Incoming Requests" count={incomingRequests.length}>
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={req.user.username} hue={265} size="md" />
                  <div className="min-w-0">
                    <Link
                      href={`/users/${encodeURIComponent(req.user.username)}`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {req.user.username}
                    </Link>
                    <p className="text-xs text-muted-foreground">Wants to be friends</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => acceptRequest(req.id)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => declineRequest(req.id)}
                    className="rounded-md bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/25"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </FriendsSection>
        ) : null}

        {outgoingRequests.length > 0 ? (
          <FriendsSection title="Outgoing Requests" count={outgoingRequests.length}>
            {outgoingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={req.user.username} hue={265} size="md" />
                  <div className="min-w-0">
                    <Link
                      href={`/users/${encodeURIComponent(req.user.username)}`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {req.user.username}
                    </Link>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cancelRequest(req.id)}
                  className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-bold hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
            ))}
          </FriendsSection>
        ) : null}

        {!hasFriends && !hasPending ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No friends yet. Find someone above — outgoing requests will show here until they
              accept.
            </p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-3 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
            >
              Find Friends
            </button>
          </div>
        ) : null}

        {playingFriends.length > 0 ? (
          <FriendsSection title="Playing" count={playingFriends.length}>
            {playingFriends.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                playing
                onRemove={removeFriend}
                subtitle={
                  <span className="flex items-center gap-1 text-primary">
                    <Gamepad2 className="size-3" />
                    Playing {f.presence.currentGameTitle || f.presence.currentGameId}
                  </span>
                }
              />
            ))}
          </FriendsSection>
        ) : null}

        {onlineFriends.length > 0 ? (
          <FriendsSection title="Online" count={onlineFriends.length}>
            {onlineFriends.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                onRemove={removeFriend}
                subtitle="Online on PlayBound"
              />
            ))}
          </FriendsSection>
        ) : null}

        {offlineFriends.length > 0 ? (
          <FriendsSection title="Offline" count={offlineFriends.length}>
            {offlineFriends.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                offline
                onRemove={removeFriend}
                subtitle="Offline"
              />
            ))}
          </FriendsSection>
        ) : null}
      </div>
    </div>
  );
}
