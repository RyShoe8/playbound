"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, Globe, Search, UserMinus, UserPlus, X } from "lucide-react";
import Link from "next/link";

export function FriendsSidebar() {
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

  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (status === "authenticated") {
      startPolling(30000); // 30 seconds
    }
    return () => stopPolling();
  }, [status, startPolling, stopPolling]);

  if (status !== "authenticated") return null;

  if (!isOpen) {
    return (
      <div className="fixed bottom-0 right-4 z-40 hidden xl:block">
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-10 items-center gap-2 rounded-t-lg bg-card px-4 font-bold shadow-[0_-2px_10px_rgba(0,0,0,0.2)] border-x border-t border-border hover:bg-secondary transition-colors"
        >
          Friends
          {incomingRequests.length > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {incomingRequests.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-4 z-40 hidden w-72 flex-col rounded-t-lg border-x border-t border-border bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.3)] xl:flex" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-secondary/50 px-4">
        <h2 className="font-bold">Friends</h2>
        <div className="flex items-center gap-2">
          <Link href="/search?tab=users" className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Search className="size-4" />
          </Link>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {incomingRequests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending Requests</h3>
            {incomingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-2">
                <div className="flex items-center gap-2 truncate">
                  <Avatar name={req.user.username} src={req.user.image ?? undefined} size="sm" />
                  <span className="truncate text-sm font-semibold">{req.user.username}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => acceptRequest(req.id)} className="rounded bg-primary/20 p-1 text-primary hover:bg-primary/30">
                    <UserPlus className="size-4" />
                  </button>
                  <button onClick={() => declineRequest(req.id)} className="rounded bg-destructive/20 p-1 text-destructive hover:bg-destructive/30">
                    <UserMinus className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Playing - {playingFriends.length}</h3>
          {playingFriends.map((f) => (
            <div key={f.id} className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary/50">
              <div className="relative">
                <Avatar name={f.username} src={f.image ?? undefined} size="sm" />
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

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Online - {onlineFriends.length}</h3>
          {onlineFriends.map((f) => (
            <div key={f.id} className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary/50">
              <div className="relative">
                <Avatar name={f.username} src={f.image ?? undefined} size="sm" />
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

        <div className="space-y-2 opacity-50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Offline - {offlineFriends.length}</h3>
          {offlineFriends.map((f) => (
            <div key={f.id} className="group flex items-center gap-3 rounded-lg p-2">
              <Avatar name={f.username} src={f.image ?? undefined} size="sm" />
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-bold">{f.username}</p>
                <p className="truncate text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
