"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, Globe, Search, UserMinus, UserPlus, X, Users } from "lucide-react";
import Link from "next/link";

export function MobileFriendsPanel() {
  const { status } = useSession();
  const {
    playingFriends,
    onlineFriends,
    offlineFriends,
    incomingRequests,
    acceptRequest,
    declineRequest,
  } = useFriendsStore();

  const [isOpen, setIsOpen] = useState(false);

  if (status !== "authenticated") return null;

  return (
    <>
      {/* Mobile nav button to open panel */}
      <button 
        onClick={() => setIsOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary xl:hidden relative"
      >
        <Users className="size-5" />
        {incomingRequests.length > 0 && (
          <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
            {incomingRequests.length}
          </span>
        )}
      </button>

      {/* Slide-over panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative ml-auto flex w-full max-w-sm flex-col bg-card shadow-2xl transition-transform duration-300 ease-in-out border-l border-border h-full">
            
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-secondary/50 px-4">
              <h2 className="text-lg font-bold">Friends</h2>
              <div className="flex items-center gap-3">
                <Link href="/search?tab=users" onClick={() => setIsOpen(false)} className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                  <Search className="size-5" />
                </Link>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                  <X className="size-5" />
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
                      <div className="flex items-center gap-3 truncate">
                        <Avatar name={req.user.username} hue={265} size="sm" />
                        <span className="truncate text-base font-semibold">{req.user.username}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => acceptRequest(req.id)} className="rounded-md bg-primary/20 p-2 text-primary hover:bg-primary/30">
                          <UserPlus className="size-5" />
                        </button>
                        <button onClick={() => declineRequest(req.id)} className="rounded-md bg-destructive/20 p-2 text-destructive hover:bg-destructive/30">
                          <UserMinus className="size-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Playing - {playingFriends.length}</h3>
                {playingFriends.map((f) => (
                  <div key={f.id} className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary/50 active:bg-secondary">
                    <div className="relative">
                      <Avatar name={f.username} hue={265} size="md" />
                      <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-card">
                        <span className="size-3 rounded-full bg-primary" />
                      </span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="truncate text-base font-bold flex items-center gap-1.5">
                        {f.username}
                        {f.discordLinked && <span className="w-2 h-2 rounded-full bg-[#5865F2]" title="Discord Linked"></span>}
                      </p>
                      <p className="truncate text-sm text-primary flex items-center gap-1.5">
                        <Gamepad2 className="size-3.5" />
                        {f.presence.currentGameId}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Online - {onlineFriends.length}</h3>
                {onlineFriends.map((f) => (
                  <div key={f.id} className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary/50 active:bg-secondary">
                    <div className="relative">
                      <Avatar name={f.username} hue={265} size="md" />
                      <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-card">
                        <span className="size-3 rounded-full bg-green-500" />
                      </span>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="truncate text-base font-bold flex items-center gap-1.5">
                        {f.username}
                        {f.discordLinked && <span className="w-2 h-2 rounded-full bg-[#5865F2]" title="Discord Linked"></span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground flex items-center gap-1.5">
                        <Globe className="size-3.5" />
                        {f.presence.status === "browsing" ? "Browsing" : f.presence.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 opacity-50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Offline - {offlineFriends.length}</h3>
                {offlineFriends.map((f) => (
                  <div key={f.id} className="group flex items-center gap-3 rounded-lg p-2">
                    <Avatar name={f.username} hue={265} size="md" />
                    <div className="flex-1 truncate">
                      <p className="truncate text-base font-bold">{f.username}</p>
                      <p className="truncate text-sm text-muted-foreground">Offline</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
