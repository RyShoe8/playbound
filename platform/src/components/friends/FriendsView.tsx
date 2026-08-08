"use client";

import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore, type FriendUser } from "@/stores/friendsStore";
import { AddFriends } from "@/components/friends/AddFriends";
import { Avatar } from "@/components/ui/bits";
import {
  Clock,
  ExternalLink,
  Gamepad2,
  Globe,
  LogIn,
  UserMinus,
  UserPlus,
  Ban,
  X,
} from "lucide-react";
import Link from "next/link";
import { telemetry } from "@/lib/telemetry";

function FriendRow({
  friend,
  subtitle,
  playing,
  onRemove,
  onBlock,
}: {
  friend: FriendUser;
  subtitle: ReactNode;
  playing?: boolean;
  onRemove: (id: string) => void;
  onBlock: (id: string) => void;
}) {
  const gameSlug = friend.presence.currentGameId;
  const gameLabel = friend.presence.currentGameTitle || gameSlug;

  return (
    <div className="group flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/50">
      <div className="relative shrink-0">
        <Avatar name={friend.username} hue={265} size="sm" />
        <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-card">
          <span
            className={`size-2.5 rounded-full ${
              playing ? "bg-primary" : friend.presence.status === "offline" ? "bg-muted-foreground/40" : "bg-green-500"
            }`}
          />
        </span>
      </div>
      <div className="min-w-0 flex-1 truncate">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold">
          <Link href={`/users/${encodeURIComponent(friend.username)}`} className="hover:underline">
            {friend.username}
          </Link>
          {friend.discordLinked ? (
            <a
              href="https://discord.com/app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[#5865F2]"
              title="Open Discord"
              onClick={() => telemetry.track("friend_discord_clicked", { source: "friends_list" })}
            >
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {playing && gameSlug ? (
          <Link
            href={`/games/${encodeURIComponent(gameSlug)}`}
            className="rounded-md bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/25"
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
          className="rounded-md bg-secondary p-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => onRemove(friend.id)}
        >
          <UserMinus className="size-3.5" />
        </button>
        <button
          type="button"
          title="Block"
          className="rounded-md bg-secondary p-1.5 text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm(`Block ${friend.username}?`)) onBlock(friend.id);
          }}
        >
          <Ban className="size-3.5" />
        </button>
      </div>
    </div>
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
    blockUser,
  } = useFriendsStore();

  useEffect(() => {
    if (status === "authenticated") {
      startPolling(30000);
      telemetry.track("friends_page_viewed", {});
    }
    return () => stopPolling();
  }, [status, startPolling, stopPolling]);

  if (status === "loading") {
    return <div className="animate-pulse text-muted-foreground">Loading friends...</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <LogIn className="size-10 text-primary" />
        <h2 className="text-xl font-bold">Sign in to view your friends</h2>
        <Link
          href="/login?callbackUrl=/friends"
          className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const hasPending = incomingRequests.length > 0 || outgoingRequests.length > 0;
  const hasFriends =
    playingFriends.length + onlineFriends.length + offlineFriends.length > 0;

  return (
    <div className="space-y-8">
      <AddFriends games={games} genres={genres} />

      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Incoming requests — {incomingRequests.length}
            </h3>
            {incomingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No incoming requests.</p>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3 truncate">
                      <Avatar name={req.user.username} hue={265} size="sm" />
                      <Link
                        href={`/users/${encodeURIComponent(req.user.username)}`}
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {req.user.username}
                      </Link>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => acceptRequest(req.id)}
                        className="rounded-md bg-primary/20 p-2 text-primary hover:bg-primary/30"
                        title="Accept"
                      >
                        <UserPlus className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => declineRequest(req.id)}
                        className="rounded-md bg-destructive/20 p-2 text-destructive hover:bg-destructive/30"
                        title="Decline"
                      >
                        <UserMinus className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Outgoing requests — {outgoingRequests.length}
            </h3>
            {outgoingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outgoing requests.</p>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3 truncate">
                      <Avatar name={req.user.username} hue={265} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/users/${encodeURIComponent(req.user.username)}`}
                          className="truncate text-sm font-semibold hover:underline"
                        >
                          {req.user.username}
                        </Link>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" /> Pending
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelRequest(req.id)}
                      className="rounded-md bg-secondary p-2 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                      title="Cancel request"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {!hasFriends && !hasPending ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No friends yet. Search above to send a request — it will show under Outgoing until they
          accept.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Playing — {playingFriends.length}
            </h3>
            {playingFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends are currently playing.</p>
            ) : (
              <div className="space-y-2">
                {playingFriends.map((f) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    playing
                    onRemove={removeFriend}
                    onBlock={blockUser}
                    subtitle={
                      <span className="flex items-center gap-1 text-primary">
                        <Gamepad2 className="size-3" />
                        Playing {f.presence.currentGameTitle || f.presence.currentGameId}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Online — {onlineFriends.length}
            </h3>
            {onlineFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends are currently online.</p>
            ) : (
              <div className="space-y-2">
                {onlineFriends.map((f) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    onRemove={removeFriend}
                    onBlock={blockUser}
                    subtitle={
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" />
                        Online on PlayBound
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 opacity-75">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Offline — {offlineFriends.length}
            </h3>
            {offlineFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {hasFriends ? "All your friends are online!" : "No offline friends yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {offlineFriends.map((f) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    onRemove={removeFriend}
                    onBlock={blockUser}
                    subtitle="Offline"
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
