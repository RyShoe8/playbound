"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Radio, Gamepad2, ArrowRight, UserPlus, LogIn, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { usePartyStore } from "@/stores/partyStore";

type FriendItem = {
  id: string;
  username: string;
  image?: string | null;
  status: string;
  currentGameTitle?: string | null;
  currentGameId?: string | null;
  currentEditionTitle?: string | null;
  currentEditionId?: string | null;
  lookingForPlayers: boolean;
  lookingForPlayersGameIds?: string[];
  party?: {
    id: string;
    gameTitle: string;
    memberCount: number;
    maxSize: number;
    canJoin: boolean;
  } | null;
  server?: {
    name: string;
    host: string;
    port: number;
  } | null;
};

type Props = {
  signedIn: boolean;
  onJoinLtpWithFriend?: (gameSlugs: string[]) => void;
};

export function MultiplayerFriendsSection({ signedIn, onJoinLtpWithFriend }: Props) {
  const [friendsPlaying, setFriendsPlaying] = useState<FriendItem[]>([]);
  const [friendsLooking, setFriendsLooking] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(signedIn);
  const { joinParty } = usePartyStore();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;

    let mounted = true;
    async function loadPlayTogether() {
      try {
        const res = await fetch("/api/play-together");
        if (!res.ok) {
          if (mounted) setLoading(false);
          return;
        }
        const data = await res.json();
        if (!mounted) return;

        if (Array.isArray(data.friendsPlaying)) {
          setFriendsPlaying(data.friendsPlaying);
        }
        if (Array.isArray(data.friendsLooking)) {
          setFriendsLooking(data.friendsLooking);
        }
      } catch (err) {
        console.error("Failed to load friend multiplayer activity:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPlayTogether();
    const interval = setInterval(loadPlayTogether, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border/60 bg-secondary/20 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Play with Friends</h3>
            <p className="text-xs text-muted-foreground">
              Sign in to see who&apos;s online, join their active parties, or match searches together.
            </p>
          </div>
        </div>
        <Link
          href="/login?callbackUrl=/multiplayer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110"
        >
          <LogIn className="size-3.5" />
          Sign In
        </Link>
      </div>
    );
  }

  const allActiveFriends = [...friendsPlaying, ...friendsLooking];
  // Deduplicate by id
  const uniqueFriends = Array.from(new Map(allActiveFriends.map((f) => [f.id, f])).values());

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border/50 bg-secondary/10 p-5">
        <div className="h-4 w-40 rounded bg-secondary/60" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-24 rounded-xl bg-secondary/40" />
          <div className="h-24 rounded-xl bg-secondary/40" />
        </div>
      </div>
    );
  }

  if (uniqueFriends.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-secondary/10 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          None of your friends are playing or looking right now. Start an open party or raise your hand to find players!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Friends Active ({uniqueFriends.length})
        </h2>
        <Link
          href="/friends"
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          Manage Friends
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {uniqueFriends.map((friend) => {
          const isLooking = friend.lookingForPlayers;
          const hasParty = friend.party && friend.party.canJoin;

          return (
            <div
              key={friend.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-3 hover:border-primary/40 hover:bg-card/90 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={friend.username} hue={265} size="md" />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-foreground truncate">{friend.username}</div>
                  {friend.currentGameTitle ? (
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Gamepad2 className="size-3 text-cyan-400" />
                      <span>{friend.currentGameTitle}</span>
                    </div>
                  ) : isLooking ? (
                    <div className="text-xs text-amber-400 truncate flex items-center gap-1">
                      <Radio className="size-3" />
                      <span>Looking to party</span>
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-400">Online</div>
                  )}
                  {friend.party && (
                    <div className="text-[11px] text-primary font-medium">
                      Party {friend.party.memberCount} / {friend.party.maxSize}
                    </div>
                  )}
                </div>
              </div>

              {/* Action */}
              <div>
                {hasParty && friend.party ? (
                  <button
                    type="button"
                    disabled={joiningId === friend.party.id}
                    onClick={async () => {
                      setJoiningId(friend.party!.id);
                      try {
                        await joinParty(friend.party!.id);
                      } finally {
                        setJoiningId(null);
                      }
                    }}
                    className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                  >
                    {joiningId === friend.party.id ? "Joining…" : "Join Party"}
                  </button>
                ) : isLooking && onJoinLtpWithFriend && friend.lookingForPlayersGameIds?.length ? (
                  <button
                    type="button"
                    onClick={() => onJoinLtpWithFriend(friend.lookingForPlayersGameIds!)}
                    className="rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-2.5 py-1.5 text-xs font-semibold text-foreground"
                  >
                    Join Search
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
