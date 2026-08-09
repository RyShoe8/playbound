"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore, type FriendUser } from "@/stores/friendsStore";
import { AddFriends } from "@/components/friends/AddFriends";
import { FriendInviteClaim } from "@/components/friends/FriendInviteClaim";
import { FriendsUpcomingEvents } from "@/components/events/FriendsUpcomingEvents";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, LogIn, UserMinus } from "lucide-react";
import Link from "next/link";
import { telemetry } from "@/lib/telemetry";

function PrivacyToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-secondary/40">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

function FriendCard({
  friend,
  subtitle,
  playing,
  away,
  offline,
  onRemove,
}: {
  friend: FriendUser;
  subtitle: ReactNode;
  playing?: boolean;
  away?: boolean;
  offline?: boolean;
  onRemove: (id: string) => void;
}) {
  const gameSlug = friend.presence.currentGameId;
  const join = friend.join;
  const showJoin =
    playing &&
    gameSlug &&
    join?.href &&
    (join.capability === "supported" || join.capability === "requiresManualJoin");

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 ${
        offline ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar name={friend.username} hue={265} size="md" />
          {playing || away || !offline ? (
            <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-card">
              <span
                className={`size-2.5 rounded-full ${
                  playing ? "bg-violet-500" : away ? "bg-amber-400" : "bg-emerald-500"
                }`}
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
        {showJoin ? (
          <Link
            href={join.href!}
            className="rounded-md bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground hover:brightness-110"
            onClick={() =>
              telemetry.track("join_game_clicked", {
                gameSlug: gameSlug || undefined,
                friendId: friend.id,
                capability: join.capability,
                surface: "friends_page",
              })
            }
          >
            {join.label || "Join Game"}
          </Link>
        ) : playing && gameSlug ? (
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
        {friend.discordLinked && playing ? (
          <a
            href="https://discord.com/app"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-bold hover:bg-secondary/80"
            onClick={() => telemetry.track("friend_discord_clicked", { source: "friends_playing" })}
          >
            Discord
          </a>
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
  const [hideActivity, setHideActivity] = useState(false);
  const [allowPlayInvites, setAllowPlayInvites] = useState(true);
  const [notifyFriendActivity, setNotifyFriendActivity] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [appearBusy, setAppearBusy] = useState(false);
  const [lfgBusy, setLfgBusy] = useState(false);
  const [lfgActive, setLfgActive] = useState(false);
  const {
    playingFriends,
    awayFriends,
    onlineFriends,
    offlineFriends,
    lookingFriends,
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
          if (!data) return;
          setAppearOffline(Boolean(data.appearOffline));
          setHideActivity(Boolean(data.hideActivityFromFriends));
          setAllowPlayInvites(data.allowPlayInvites !== false);
          setNotifyFriendActivity(data.notifyFriendActivity !== false);
        })
        .catch(() => {});
      void fetch("/api/play-together")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.myLfg) setLfgActive(Boolean(data.myLfg.active));
        })
        .catch(() => {});
    }
    return () => stopPolling();
  }, [status, startPolling, stopPolling]);

  async function patchVisibility(patch: Record<string, boolean>) {
    setAppearBusy(true);
    try {
      const res = await fetch("/api/presence/visibility", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      if (patch.appearOffline !== undefined) {
        setAppearOffline(patch.appearOffline);
        telemetry.track("appear_offline_toggled", { enabled: patch.appearOffline });
      }
      if (patch.hideActivityFromFriends !== undefined) {
        setHideActivity(patch.hideActivityFromFriends);
      }
      if (patch.allowPlayInvites !== undefined) {
        setAllowPlayInvites(patch.allowPlayInvites);
      }
      if (patch.notifyFriendActivity !== undefined) {
        setNotifyFriendActivity(patch.notifyFriendActivity);
      }
      return true;
    } finally {
      setAppearBusy(false);
    }
  }

  async function toggleAppearOffline() {
    await patchVisibility({ appearOffline: !appearOffline });
  }

  async function toggleLfg() {
    const next = !lfgActive;
    setLfgBusy(true);
    try {
      const gameSlug = playingFriends[0]?.presence.currentGameId || undefined;
      const res = await fetch("/api/presence/lfg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next, gameSlug: next ? gameSlug : null }),
      });
      if (res.ok) {
        setLfgActive(next);
        telemetry.track(next ? "lfg_enabled" : "lfg_disabled", next ? { gameSlug } : {});
      }
    } finally {
      setLfgBusy(false);
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
    playingFriends.length +
      awayFriends.length +
      onlineFriends.length +
      offlineFriends.length >
    0;
  const lookingOnly = lookingFriends.filter((f) => f.presence.status !== "playing");

  return (
    <div className="space-y-5">
      <FriendInviteClaim />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Friends</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See who&apos;s playing and jump in together.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={lfgBusy}
            onClick={() => void toggleLfg()}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-60"
            title="Let friends know you want people to play with (expires in 60 minutes)"
          >
            {lfgBusy ? "Saving…" : lfgActive ? "Stop looking" : "Looking for players"}
          </button>
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

      {addOpen ? <AddFriends games={games} genres={genres} /> : null}

      <div className="rounded-xl border border-border bg-card/40 px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
          onClick={() => setPrivacyOpen((v) => !v)}
        >
          <span>Activity privacy</span>
          <span className="text-xs text-muted-foreground">{privacyOpen ? "Hide" : "Show"}</span>
        </button>
        {privacyOpen ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <PrivacyToggle
              label="Appear offline"
              description="Friends see you as offline"
              checked={appearOffline}
              disabled={appearBusy}
              onChange={() => void toggleAppearOffline()}
            />
            <PrivacyToggle
              label="Hide what I'm playing"
              description="Stay online without sharing game activity"
              checked={hideActivity}
              disabled={appearBusy}
              onChange={() => void patchVisibility({ hideActivityFromFriends: !hideActivity })}
            />
            <PrivacyToggle
              label="Allow play invites"
              description="Friends can invite you to play"
              checked={allowPlayInvites}
              disabled={appearBusy}
              onChange={() => void patchVisibility({ allowPlayInvites: !allowPlayInvites })}
            />
            <PrivacyToggle
              label="Friend activity notifications"
              description="Get notified when friends start playing or LFG"
              checked={notifyFriendActivity}
              disabled={appearBusy}
              onChange={() =>
                void patchVisibility({ notifyFriendActivity: !notifyFriendActivity })
              }
            />
          </div>
        ) : null}
      </div>

      <PlayWithFriends surface="friends_page" />

      <FriendsUpcomingEvents />

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
          <FriendsSection title="Playing Now" count={playingFriends.length}>
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
                    {f.presence.lookingForPlayers ? " · Looking for players" : ""}
                  </span>
                }
              />
            ))}
          </FriendsSection>
        ) : null}

        {lookingOnly.length > 0 ? (
          <FriendsSection title="Looking for Players" count={lookingOnly.length}>
            {lookingOnly.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                onRemove={removeFriend}
                subtitle={
                  <span>
                    Looking for players
                    {f.presence.lookingForPlayersGameId
                      ? ` · ${f.presence.lookingForPlayersGameId}`
                      : ""}
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

        {awayFriends.length > 0 ? (
          <FriendsSection title="Away" count={awayFriends.length}>
            {awayFriends.map((f) => (
              <FriendCard key={f.id} friend={f} away onRemove={removeFriend} subtitle="Away" />
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
