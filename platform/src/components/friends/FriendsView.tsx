"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore, type FriendUser } from "@/stores/friendsStore";
import { AddFriends } from "@/components/friends/AddFriends";
import { FriendInviteClaim } from "@/components/friends/FriendInviteClaim";
import { FriendsUpcomingEvents } from "@/components/events/FriendsUpcomingEvents";
import { Avatar } from "@/components/ui/bits";
import { Gamepad2, LogIn, UserMinus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { telemetry } from "@/lib/telemetry";
import { usePartyStore } from "@/stores/partyStore";
import { PartyView, type PartyGameOption } from "@/components/friends/PartyView";
import { PartyDiscovery } from "@/components/friends/PartyDiscovery";
import { PartyConfigSync } from "@/components/friends/PartyConfigSync";
import { CreatePartyPanel } from "@/components/friends/CreatePartyPanel";
import { PopoutButton } from "@/components/friends/PopoutButton";
import { Checkbox } from "@/components/ui/Checkbox";

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
    <div className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40 transition-colors">
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground leading-snug">{description}</span>
      </div>
      <div className="pt-0.5">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function FriendCard({
  friend,
  subtitle,
  playing,
  away,
  offline,
  onRemove,
  lfgJoinSlug,
  partyId,
  onJoinParty,
  inYourParty,
}: {
  friend: FriendUser;
  subtitle: ReactNode;
  playing?: boolean;
  away?: boolean;
  offline?: boolean;
  onRemove: (id: string) => void;
  /**
   * Set only by the Looking for Players section. Someone who is looking is not
   * necessarily in-game yet, so `friend.join` — which is derived from what they
   * are currently playing — is empty and the card would otherwise offer no way
   * to act on the signal at all.
   */
  lfgJoinSlug?: string | null;
  partyId?: string | null;
  onJoinParty?: (partyId: string) => void;
  inYourParty?: boolean;
}) {
  const gameSlug = friend.presence.currentGameId;
  const join = friend.join;
  const showJoin =
    playing &&
    gameSlug &&
    join?.href &&
    (join.capability === "supported" || join.capability === "requiresManualJoin");

  const shared = friend.sharedGames || [];
  const shownShared = shared.slice(0, 8);
  const extraShared = shared.length - shownShared.length;

  return (
    <div
      className={`flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 ${
        offline ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            <Avatar name={friend.username} hue={265} size="lg" />
            {playing || away || !offline ? (
              <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-card">
                <span
                  className={`size-2.5 rounded-full ${
                    playing ? "bg-violet-500" : away ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
              </span>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight">
              <Link
                href={`/users/${encodeURIComponent(friend.username)}`}
                className="hover:underline"
              >
                {friend.username}
              </Link>
              {friend.discordLinked ? (
                <span
                  className="inline-block size-2.5 rounded-full bg-[#5865F2]"
                  title="Discord linked"
                />
              ) : null}
            </p>
            <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
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
        ) : inYourParty ? (
          <span className="text-[11px] font-semibold text-muted-foreground">In your party</span>
        ) : partyId ? (
          <button
            type="button"
            className="rounded-md bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground hover:brightness-110"
            onClick={() => onJoinParty?.(partyId)}
          >
            Join Party
          </button>
        ) : lfgJoinSlug ? (
          <Link
            href={`/games/${encodeURIComponent(lfgJoinSlug)}`}
            className="rounded-md bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground hover:brightness-110"
            onClick={() =>
              telemetry.track("lfg_join_clicked", {
                gameSlug: lfgJoinSlug,
                friendId: friend.id,
                surface: "friends_page",
              })
            }
          >
            Join
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
      <div className="mt-auto">
        {shownShared.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {shownShared.map((game) => (
              <Link
                key={game.slug}
                href={`/games/${encodeURIComponent(game.slug)}`}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
              >
                {game.title}
              </Link>
            ))}
            {extraShared > 0 ? (
              <span className="rounded-full bg-secondary/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                +{extraShared} more
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No shared installs yet</p>
        )}
      </div>
    </div>
  );
}

/** Cap matches MAX_LFG_GAMES in /api/presence/lfg. */
const LFG_MAX_GAMES = 6;

/**
 * Picking preferred games when you raise your hand.
 *
 * Type-to-filter over the catalog with the picks pinned above it, so choosing
 * several is a few keystrokes rather than a scroll through everything — and
 * choosing none is a valid, one-click answer ("up for anything") rather than a
 * dead end.
 */
function LfgGamePicker({
  games,
  busy,
  onCancel,
  onConfirm,
}: {
  games: PartyGameOption[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const titleOf = (slug: string) => games.find((g) => g.slug === slug)?.title || slug;
  const atLimit = selected.length >= LFG_MAX_GAMES;

  const needle = query.trim().toLowerCase();
  const matches = games
    .filter((g) => !selected.includes(g.slug))
    .filter((g) => (needle ? g.title.toLowerCase().includes(needle) : true))
    .slice(0, needle ? 24 : 12);

  function toggle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= LFG_MAX_GAMES
        ? prev
        : [...prev, slug]
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h4 className="font-bold">What do you want to play?</h4>
        <p className="text-sm text-muted-foreground">
          Pick up to {LFG_MAX_GAMES}, or skip it and you&apos;ll show as up for anything. Expires
          in 60 minutes.
        </p>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => toggle(slug)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
              title="Remove"
            >
              {titleOf(slug)}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search games…"
        className="h-10 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm shadow-sm backdrop-blur"
        autoComplete="off"
      />

      <div className="flex flex-wrap gap-1.5">
        {matches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No games match that.</p>
        ) : (
          matches.map((game) => (
            <button
              key={game.slug}
              type="button"
              disabled={atLimit}
              onClick={() => toggle(game.slug)}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40"
            >
              {game.title}
            </button>
          ))
        )}
      </div>
      {atLimit ? (
        <p className="text-xs text-muted-foreground">
          That&apos;s {LFG_MAX_GAMES} — remove one to swap it out.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(selected)}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          {busy
            ? "Saving…"
            : selected.length > 0
            ? `Look for a party (${selected.length})`
            : "Look for a party"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80"
        >
          Cancel
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export function FriendsView({
  games,
  genres,
}: {
  games: PartyGameOption[];
  genres: string[];
}) {
  const { data: session, status } = useSession();
  const [addOpen, setAddOpen] = useState(false);
  const [appearOffline, setAppearOffline] = useState(false);
  const [hideActivity, setHideActivity] = useState(false);
  const [allowPlayInvites, setAllowPlayInvites] = useState(true);
  const [notifyFriendActivity, setNotifyFriendActivity] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [appearBusy, setAppearBusy] = useState(false);
  const [lfgBusy, setLfgBusy] = useState(false);
  const [lfgActive, setLfgActive] = useState(false);
  const [lfgGames, setLfgGames] = useState<string[]>([]);
  const [lfgPickerOpen, setLfgPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const {
    playingFriends,
    awayFriends,
    onlineFriends,
    offlineFriends,
    lookingFriends,
    inPartyFriends,
    incomingRequests,
    outgoingRequests,
    startPolling,
    stopPolling,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
  } = useFriendsStore();
  
  const searchParams = useSearchParams();
  const partyParam = searchParams.get("party");
  
  const { 
    activeParty, 
    discoverableParties,
    startPolling: startPartyPolling, 
    stopPolling: stopPartyPolling,
    joinParty,
    fetchParties
  } = usePartyStore();

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
          if (data?.myLfg) {
            setLfgActive(Boolean(data.myLfg.active));
            if (Array.isArray(data.myLfg.gameSlugs)) setLfgGames(data.myLfg.gameSlugs);
            else if (data.myLfg.gameSlug) setLfgGames([data.myLfg.gameSlug]);
          }
        })
        .catch(() => {});
        
      startPartyPolling(15000);
      if (partyParam) {
        void joinParty(partyParam);
      }
    }
    return () => {
      stopPolling();
      stopPartyPolling();
    };
  }, [status, startPolling, stopPolling, startPartyPolling, stopPartyPolling, partyParam, joinParty]);

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

  /**
   * Turning it off is one click. Turning it on opens the picker first so the
   * preferred games can be chosen — sending "looking, for anything" and making
   * people edit it afterwards is the worse default.
   */
  async function toggleLfg() {
    if (!lfgActive) {
      setLfgPickerOpen((v) => !v);
      return;
    }
    setLfgBusy(true);
    try {
      const res = await fetch("/api/presence/lfg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      if (res.ok) {
        setLfgActive(false);
        setLfgGames([]);
        telemetry.track("lfg_disabled", {});
      }
    } finally {
      setLfgBusy(false);
    }
  }

  async function startLfg(gameSlugs: string[]) {
    setLfgBusy(true);
    try {
      const res = await fetch("/api/presence/lfg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true, gameSlugs }),
      });
      if (res.ok) {
        setLfgActive(true);
        setLfgGames(gameSlugs);
        setLfgPickerOpen(false);
        telemetry.track("lfg_enabled", { gameCount: gameSlugs.length });
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
  const offlineIds = new Set(offlineFriends.map((f) => f.id));
  const onlineAll: FriendUser[] = [];
  const seenOnline = new Set<string>();
  for (const f of [
    ...inPartyFriends,
    ...playingFriends,
    ...lookingOnly,
    ...onlineFriends,
    ...awayFriends,
  ]) {
    if (offlineIds.has(f.id) || seenOnline.has(f.id)) continue;
    seenOnline.add(f.id);
    onlineAll.push(f);
  }

  return (
    <div className="space-y-5">
      <FriendInviteClaim />

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Friends</h1>
          </div>
          <PopoutButton />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!activeParty ? (
            <button
              type="button"
              onClick={() => {
                setCreateOpen((v) => !v);
                if (!createOpen) setAddOpen(false);
              }}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110"
            >
              {createOpen ? "Close" : "Start Party"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={lfgBusy}
            onClick={() => void toggleLfg()}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-60"
            title="Let people know you want a game (expires in 60 minutes)"
          >
            {lfgBusy
              ? "Saving…"
              : lfgActive
              ? "Stop looking"
              : lfgPickerOpen
              ? "Close"
              : "Look for party"}
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
            onClick={() => {
              setAddOpen((v) => !v);
              if (!addOpen) setCreateOpen(false);
            }}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-semibold hover:bg-secondary/80"
          >
            {addOpen ? "Close" : "Add Friend"}
          </button>
        </div>
      </div>

      {addOpen ? <AddFriends games={games} genres={genres} /> : null}
      {createOpen ? (
        <CreatePartyPanel onCreated={() => setCreateOpen(false)} />
      ) : null}
      {lfgPickerOpen && !lfgActive ? (
        <LfgGamePicker
          games={games}
          busy={lfgBusy}
          onCancel={() => setLfgPickerOpen(false)}
          onConfirm={(slugs) => void startLfg(slugs)}
        />
      ) : null}
      {lfgActive ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re looking to party
          {lfgGames.length > 0
            ? ` · ${lfgGames
                .map((slug) => games.find((g) => g.slug === slug)?.title || slug)
                .join(", ")}`
            : " · up for anything"}
          {" — "}
          <Link href="/looking-to-party" className="font-semibold text-primary hover:underline">
            see who else is
          </Link>
        </p>
      ) : null}

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

      {activeParty && (
        <div className="space-y-3">
          <PartyView party={activeParty} games={games} />
          {/*
            * Shown to every member, not just the leader. The warning exists for
            * the people who need to change something — including a host who
            * picked a game they have not installed yet. The component renders
            * the green ready state when everyone is in sync.
            */}
          {session?.user && activeParty.gameSlug && (
            <PartyConfigSync
              partyId={activeParty.id}
              gameSlug={activeParty.gameSlug}
              editionSlug={activeParty.editionSlug}
              currentUserId={session.user.id}
            />
          )}
        </div>
      )}
      
      {!activeParty && <PartyDiscovery />}

      <div className="space-y-8">
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

        {onlineAll.length > 0 ? (
          <FriendsSection title="Online" count={onlineAll.length}>
            {onlineAll.map((f) => {
              const inParty = Boolean(f.presence.currentPartyId);
              const isPlaying = f.presence.status === "playing";
              const isAway = f.presence.status === "away";
              const isLooking = Boolean(f.presence.lookingForPlayers);
              return (
                <FriendCard
                  key={f.id}
                  friend={f}
                  playing={isPlaying}
                  away={isAway}
                  onRemove={removeFriend}
                  partyId={inParty ? f.presence.currentPartyId : null}
                  inYourParty={Boolean(
                    inParty && activeParty?.id && f.presence.currentPartyId === activeParty.id
                  )}
                  lfgJoinSlug={!isPlaying && isLooking ? f.presence.lookingForPlayersGameId ?? null : null}
                  onJoinParty={(id) => {
                    void joinParty(id);
                  }}
                  subtitle={
                    inParty ? (
                      <span className="text-primary">
                        In a party
                        {f.presence.currentGameTitle || f.presence.currentGameId
                          ? ` · ${f.presence.currentGameTitle || f.presence.currentGameId}`
                          : ""}
                      </span>
                    ) : isPlaying ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Gamepad2 className="size-3.5" />
                        Playing {f.presence.currentGameTitle || f.presence.currentGameId}
                        {isLooking ? " · Looking for players" : ""}
                      </span>
                    ) : isLooking ? (
                      <span>
                        Looking for players
                        {f.presence.lookingForPlayersGameTitle
                          ? ` · ${f.presence.lookingForPlayersGameTitle}`
                          : ""}
                      </span>
                    ) : isAway ? (
                      "Away"
                    ) : (
                      "Online on PlayBound"
                    )
                  }
                />
              );
            })}
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

        {incomingRequests.length > 0 ? (
          <FriendsSection title="Incoming Requests" count={incomingRequests.length}>
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={req.user.username} hue={265} size="lg" />
                  <div className="min-w-0">
                    <Link
                      href={`/users/${encodeURIComponent(req.user.username)}`}
                      className="text-lg font-extrabold hover:underline"
                    >
                      {req.user.username}
                    </Link>
                    <p className="text-sm text-muted-foreground">Wants to be friends</p>
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={req.user.username} hue={265} size="lg" />
                  <div className="min-w-0">
                    <Link
                      href={`/users/${encodeURIComponent(req.user.username)}`}
                      className="text-lg font-extrabold hover:underline"
                    >
                      {req.user.username}
                    </Link>
                    <p className="text-sm text-muted-foreground">Pending</p>
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
      </div>

      <FriendsUpcomingEvents />
    </div>
  );
}
