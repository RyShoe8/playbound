"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { AddFriends } from "@/components/friends/AddFriends";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, Globe, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { LogIn } from "lucide-react";

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
    startPolling,
    stopPolling,
    acceptRequest,
    declineRequest,
  } = useFriendsStore();

  useEffect(() => {
    if (status === "authenticated") {
      startPolling(30000); // 30 seconds
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

  return (
    <div className="space-y-8">
      <AddFriends games={games} genres={genres} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Friends Column */}
        <div className="space-y-6">
          {incomingRequests.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending Requests</h3>
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                    <div className="flex items-center gap-3 truncate">
                      <Avatar name={req.user.username} hue={265} size="sm" />
                      <span className="truncate text-sm font-semibold">{req.user.username}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => acceptRequest(req.id)} className="rounded-md bg-primary/20 p-2 text-primary hover:bg-primary/30" title="Accept">
                        <UserPlus className="size-4" />
                      </button>
                      <button onClick={() => declineRequest(req.id)} className="rounded-md bg-destructive/20 p-2 text-destructive hover:bg-destructive/30" title="Decline">
                        <UserMinus className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Playing - {playingFriends.length}</h3>
            {playingFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends are currently playing.</p>
            ) : (
              <div className="space-y-2">
                {playingFriends.map((f) => (
                  <div key={f.id} className="group flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/50">
                    <div className="relative">
                      <Avatar name={f.username} hue={265} size="sm" />
                      <span className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-card">
                        <span className="size-2.5 rounded-full bg-primary" />
                      </span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="truncate text-sm font-bold flex items-center gap-1">
                        {f.username}
                        {f.discordLinked && <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" title="Discord Linked"></span>}
                      </p>
                      <p className="truncate text-xs text-primary flex items-center gap-1">
                        <Gamepad2 className="size-3" />
                        {f.presence.currentGameId}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Online - {onlineFriends.length}</h3>
            {onlineFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends are currently online.</p>
            ) : (
              <div className="space-y-2">
                {onlineFriends.map((f) => (
                  <div key={f.id} className="group flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/50">
                    <div className="relative">
                      <Avatar name={f.username} hue={265} size="sm" />
                      <span className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-card">
                        <span className="size-2.5 rounded-full bg-green-500" />
                      </span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="truncate text-sm font-bold flex items-center gap-1">
                        {f.username}
                        {f.discordLinked && <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" title="Discord Linked"></span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="size-3" />
                        {f.presence.status === "browsing" ? "Browsing" : f.presence.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Offline Friends Column */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 opacity-75">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Offline - {offlineFriends.length}</h3>
            {offlineFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">All your friends are online!</p>
            ) : (
              <div className="space-y-2">
                {offlineFriends.map((f) => (
                  <div key={f.id} className="group flex items-center gap-3 rounded-lg p-2">
                    <Avatar name={f.username} hue={265} size="sm" />
                    <div className="flex-1 truncate">
                      <p className="truncate text-sm font-bold flex items-center gap-1">
                        {f.username}
                        {f.discordLinked && <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" title="Discord Linked"></span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">Offline</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
