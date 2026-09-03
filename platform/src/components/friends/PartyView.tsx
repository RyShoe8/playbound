"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Users, Crown, LogOut, X, Phone, HardDriveDownload } from "lucide-react";
import { usePartyStore } from "@/stores/partyStore";
import { computePartyActions } from "@/lib/playTogether/partyActions";
import { PartyActionIconView, partyButtonClass, partyNoteClass } from "./partyActionStyle";
import type { PartyPayload } from "@/lib/playTogether/types";
import { filterGamesForParty } from "@/lib/playTogether/partyPlatforms";
import {
  PARTY_NAME_MAX,
  PARTY_VISIBILITIES,
  PARTY_VISIBILITY_LABELS,
  OPENRA_MODS,
  OPENRA_MOD_LABELS,
  partyDisplayName,
} from "@/lib/playTogether/types";
import type { LaunchMethod } from "@/lib/data/types";
import { launcherJoinUrl, launcherPlayUrl } from "@/lib/launcher";
import { isBrowserGame } from "@/lib/gameLaunch";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { launcherDownloadUrlForOs } from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  DISCORD_HANDOFF_MS,
  firePlayboundDeepLink,
  parseDiscordInviteCode,
  openPlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { withOutboundUtm } from "@/lib/utm";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { DiscordLinkPrompt } from "@/components/friends/DiscordLinkPrompt";
import { PartyHostInstallPicker } from "@/components/friends/PartyHostInstallPicker";
import { PartyChat } from "@/components/friends/PartyChat";
import { PartyConfigSync } from "@/components/friends/PartyConfigSync";
import {
  PartyGameOnlineCount,
  PartyPublicServerPicker,
  type PartyPublicServerGate,
} from "@/components/friends/PartyPublicServerPicker";
import { PartyServerSettings } from "@/components/friends/PartyServerSettings";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

export type PartyGameOption = {
  slug: string;
  title: string;
  website?: string;
  launchMethods?: LaunchMethod[];
  browserPlayable?: boolean;
  platforms?: string[];
  steamDeck?: boolean;
  launcherInstall?: { enabled?: boolean; kind?: string } | null;
  /**
   * Only used to decide whether the game belongs in a party at all.
   *
   * Both read by supportsMultiplayer — hotseat, LAN and split-screen games
   * only say so in tags, never features. Dropping either one here silently
   * shrinks this picker below what the launcher's party screen offers, since
   * the launcher's catalog carries both.
   */
  features?: string[];
  tags?: string[];
};

export function PartyView({
  party,
  games = [],
}: {
  party: PartyPayload;
  games?: PartyGameOption[];
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const {
    leaveParty,
    removeMember,
    transferLeadership,
    setVisibility,
    setReady,
    joinGame,
    endParty,
    provisionDiscord,
    setGame,
    setHostMode,
    setName,
    setOpenRaMod,
  } = usePartyStore();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [discordPrompt, setDiscordPrompt] = useState<{ open: boolean; inviteUrl: string | null }>({
    open: false,
    inviteUrl: null,
  });
  const { mode, device } = useCompatibilityFilter();

  const isLeader = party.leaderId === userId;
  const me = party.members.find((m) => m.userId === userId);
  const isReady = me?.ready ?? false;
  const hasGame = Boolean(party.gameSlug);
  /*
   * A couch game has no networking: it runs on the leader's PC and everyone
   * else joins by opening the controller link on a phone. So only the leader
   * gets Join Game — a member launching their own copy would start a separate
   * single-player session.
   */
  const couchMode = Boolean(party.couch?.enabled);
  /*
   * The action bar, resolved server-side so this panel and the launcher's
   * cannot disagree about labels, gating or which button is primary. The
   * fallback covers a payload built without a viewer (a public listing), where
   * there is no "you" to gate on and the bar is not shown anyway.
   */
  const actions =
    party.actions ??
    computePartyActions({
      viewerId: userId ?? "",
      leaderId: party.leaderId,
      leaderUsername: party.leaderUsername,
      status: party.status,
      gameSlug: party.gameSlug,
      hostMode: party.hostMode,
      selfHostReady: party.selfHostReady,
      members: party.members.map((m) => ({ userId: m.userId, ready: m.ready })),
      hosted: party.hosted,
      lan: party.lan,
      couch: party.couch,
    });
  // Resolved server-side; the registry that knows which games these are is not
  // something a client component should pull into its bundle.
  const couchOnly = new Set(party.couchOnlyGames || []);
  const canJoinGame =
    hasGame &&
    party.status !== "ended" &&
    (isReady || party.status === "playing" || party.status === "launching") &&
    (!couchMode || isLeader);
  const catalogGame = games.find((g) => g.slug === party.gameSlug);
  /*
   * Only games a party could actually play together.
   *
   * The picker listed the whole catalog, so choosing a singleplayer game was
   * possible and produced a party that could never launch as one.
   *
   * Uses launcherInstall's predicate — the one the catalog's own isMultiplayer
   * flag is built from, and what the launcher filters on — so both pickers show
   * the same games. playTogether/multiplayer.ts has a second, text-only rule
   * that returns 16 of 61 where this returns 49: it misses OpenRA, Xonotic and
   * OpenArena, whose tags never say "multiplayer" but which have server
   * browsers.
   */
  /*
   * requiredPlatforms is resolved server-side from every member's presence, so
   * a mixed party — someone on Windows, someone on Linux — is only offered
   * games all of them can actually run. Picking a Windows-only game for a
   * party with a Linux member strands them after the group has committed to
   * it.
   */
  const partyGames = useMemo(
    () =>
      filterGamesForParty(
        games
          .filter((g) => supportsMultiplayer(g))
          .filter((g) => supportsLauncherParty(g))
          .filter((g) => mode === "all" || isGameCompatible(g, device.type)),
        party.requiredPlatforms || []
      ),
    [games, mode, device.type, party.requiredPlatforms]
  );

  /*
   * After the hooks, not before them. The session arrives a render late, so
   * bailing out above useMemo changed the hook count between the first and
   * second render of the same panel.
   */
  if (!userId) return null;

  const requiredPlatformLabels = (party.requiredPlatforms || []).map(
    (p) => ({ windows: "Windows", macos: "macOS", linux: "Linux" })[p] || p
  );
  const hostedReady =
    party.hosted?.status === "ready" && party.hosted.host && party.hosted.port;
  const joinUrl = hostedReady
    ? launcherJoinUrl(
        party.gameSlug,
        party.hosted.host!,
        party.hosted.port!,
        party.hosted.name || party.gameTitle || undefined
      )
    : null;
  const browserHref =
    catalogGame &&
    isBrowserGame({
      browserPlayable: Boolean(catalogGame.browserPlayable),
      launchMethods: catalogGame.launchMethods ?? [],
    }) &&
    catalogGame.website
      ? withOutboundUtm(catalogGame.website, {
          campaign: "party_join_game",
          content: party.gameSlug,
        })
      : null;
  const joinHref =
    joinUrl ||
    browserHref ||
    // Hosted titles must not fall back to playbound://play — that launches a
    // local client with no server, so both players sit in single-player.
    (party.hosted?.enabled ? undefined : launcherPlayUrl(party.gameSlug));
  const joinOpensBrowser = Boolean(browserHref && !joinUrl);
  /*
   * When Connect will provision a room, do not navigate via href until we have
   * host:port. A premature playbound://play or "#" races provision and lands
   * players in single-player / an empty deep-link panel.
   */
  const waitForHostedRoom = Boolean(party.hosted?.enabled && !joinUrl && !browserHref);
  const inFlight = party.status === "playing" || party.status === "launching";
  /*
   * A virtual-LAN party has no listen server to probe, so selfHostReady never
   * arrives and waiting on it never ends. Those members are gated on the party
   * being in flight instead — see joinPartyGame.
   */
  const memberWaitingForHost =
    !isLeader &&
    !couchMode &&
    party.hostMode === "self" &&
    (party.lan?.enabled ? !inFlight : !party.selfHostReady);
  const lanReady = Boolean(
    party.lan?.enabled &&
      (party.lan.configured === false || party.lan?.status === "ready")
  );
  const joinConnectBlocked =
    memberWaitingForHost ||
    (Boolean(party.hosted?.enabled) && party.hosted?.status !== "ready") ||
    (Boolean(party.lan?.enabled) && !lanReady);
  const publicMode = hasGame && party.hostMode === "public";
  /*
   * Ready-up comes first. The server a party lands on is the last thing decided
   * before Join Game, and picking one while half the party is still installing
   * left the panel showing a chosen server nobody could reach — so the list is
   * inert until the leader is ready, and says which step it is waiting on.
   */
  const publicServerGate: PartyPublicServerGate | null = !isLeader
    ? "leader"
    : party.status === "ended" || inFlight
      ? "locked"
      : !isReady
        ? "ready"
        : null;

  function handleJoinGame(e?: React.MouseEvent) {
    if (joinConnectBlocked) {
      e?.preventDefault();
      return;
    }
    if (waitForHostedRoom) {
      e?.preventDefault();
    }
    /*
     * For non-hosted / browser titles the <a href> is the handoff. For hosted
     * titles we only open playbound://join after join-game returns a ready room.
     */
    void (async () => {
      const next = await joinGame(party.id);
      if (
        next &&
        ((next.hosted?.enabled && next.hosted.status !== "ready") ||
          (next.lan?.enabled && next.lan.status !== "ready"))
      ) {
        return;
      }
      const nextJoin =
        next?.hosted?.status === "ready" && next.hosted.host && next.hosted.port
          ? launcherJoinUrl(
              next.gameSlug,
              next.hosted.host,
              next.hosted.port,
              next.hosted.name || next.gameTitle || undefined
            )
          : null;
      if (nextJoin && (waitForHostedRoom || nextJoin !== joinUrl)) {
        openPlayboundDeepLink(nextJoin, {
          autoDownload: true,
          downloadUrl: launcherDownloadUrlForOs(detectLauncherOs()),
        });
      } else if (waitForHostedRoom && next?.hosted?.status === "failed") {
        /* Store already surfaces hosted.error on the party payload. */
      }
    })();
  }

  const handleLaunchVoice = async () => {
    setVoiceBusy(true);
    setVoiceError(null);
    try {
      let inviteUrl = party.discord?.inviteUrl;
      if (!inviteUrl) {
        const result = await provisionDiscord(party.id);
        if (!result.inviteUrl) {
          setVoiceError(result.error || "Could not launch Discord voice.");
          if (result.needsDiscordLink) {
            setDiscordPrompt({ open: true, inviteUrl: null });
          }
          return;
        }
        inviteUrl = result.inviteUrl;
      } else {
        void provisionDiscord(party.id);
      }

      const code = parseDiscordInviteCode(inviteUrl);
      if (!code) {
        window.open(inviteUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // Fire desktop app deep link first without creating a blank tab
      firePlayboundDeepLink(`discord://-/invite/${code}`);

      // Fall back to opening browser tab if app did not take focus
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.open(inviteUrl, "_blank", "noopener,noreferrer");
        }
      }, DISCORD_HANDOFF_MS);
    } catch {
      setVoiceError("Could not launch Discord voice.");
    } finally {
      setVoiceBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-muted border-b border-border">
        {/* Identity and the two party-wide settings */}
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            {isLeader && party.status !== "ended" ? (
              <input
                type="text"
                defaultValue={party.name || ""}
                key={party.name || "unnamed"}
                maxLength={PARTY_NAME_MAX}
                placeholder={partyDisplayName(party)}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (party.name || "")) void setName(party.id, next || null);
                }}
                className="h-10 w-full max-w-md rounded-lg border border-border bg-secondary/50 px-3 text-sm font-bold shadow-sm backdrop-blur"
              />
            ) : (
              <h3 className="text-lg font-bold">{partyDisplayName(party)}</h3>
            )}
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="capitalize">{party.status.replace("_", " ")}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {party.members.length} / {party.maxSize}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:justify-end">
            {isLeader &&
              party.status !== "ended" &&
              party.hostModes &&
              party.hostModes.length > 1 &&
              !party.hosted?.roomCode && (
                <div className="w-44">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                    Server Hosting
                  </label>
                  <PremiumSelect
                    value={party.hostMode || ""}
                    onChange={(e) => void setHostMode(party.id, e.target.value)}
                  >
                    {party.hostModes.map((o) => (
                      <option key={o.mode} value={o.mode}>
                        {o.label}
                      </option>
                    ))}
                  </PremiumSelect>
                </div>
              )}

            {isLeader && party.status !== "ended" && (
              <div className="w-44">
                <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                  Who Can Play
                </label>
                <PremiumSelect
                  value={party.visibility}
                  onChange={(e) =>
                    void setVisibility(party.id, e.target.value as PartyPayload["visibility"])
                  }
                >
                  {PARTY_VISIBILITIES.filter((v) => v !== "event").map((v) => (
                    <option key={v} value={v}>
                      {PARTY_VISIBILITY_LABELS[v]}
                    </option>
                  ))}
                </PremiumSelect>
              </div>
            )}
          </div>
        </div>

        {/*
          * What the party is playing, beside whether it can. Both used to sit in
          * the same header row as the settings above — the game squeezed into a
          * narrow column and the install status stacked under two 176px
          * dropdowns, which is what made the panel read as three unrelated
          * widths.
          */}
        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
          <div className="min-w-0">
            {/*
              * Available for as long as the party is alive, including while it
              * is playing: finishing one game and picking another is how a
              * party carries on, and changing the pick winds the party back to
              * forming server-side.
              */}
            {isLeader && party.status !== "ended" ? (
              <div className="max-w-[240px]">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Game
                  </span>
                  <PremiumSelect
                    value={party.gameSlug || ""}
                    onChange={(e) => {
                      if (e.target.value) void setGame(party.id, e.target.value);
                    }}
                  >
                    <option value="">Select a game</option>
                    {/*
                      Marked in the list, not after the fact: these games have
                      no online play, and a leader who picked one expecting a
                      server had already committed the party to it by the time
                      the card said otherwise.
                    */}
                    {partyGames.map((g) => (
                      <option key={g.slug} value={g.slug}>
                        {couchOnly.has(g.slug) ? `${g.title} (couch co-op)` : g.title}
                      </option>
                    ))}
                    {/*
                      Keeps whatever is already selected visible, including a game
                      the filter now excludes. A party set to a singleplayer title
                      before this filter existed would otherwise render a blank
                      selector and look broken rather than merely out of date.
                    */}
                    {party.gameSlug && !partyGames.some((g) => g.slug === party.gameSlug) ? (
                      <option value={party.gameSlug}>{party.gameTitle || party.gameSlug}</option>
                    ) : null}
                  </PremiumSelect>
                </label>
                {/*
                  A shorter list with no explanation reads as games having
                  disappeared; the leader cannot guess a member's OS is why.
                */}
                {requiredPlatformLabels.length > 1 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Showing games that run on {requiredPlatformLabels.join(" and ")} — everyone in
                    this party has to be able to play.
                  </p>
                ) : null}
{/*
                  Sits under the game, before anybody readies up, because the
                  host picker hides itself when there is only one mode — so
                  without this a couch party looks exactly like an online one
                  right up until Start Game.
                */}
                {couchMode ? (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-primary">
                      Couch co-op · no online play
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Runs on {isLeader ? "your PC" : `${party.leaderUsername || "the host"}'s PC`}.
                      Everyone else plays on it with their phone as a controller.
                    </p>
                  </div>
                ) : null}
                {party.gameSlug && !publicMode && !couchMode ? (
                  <PartyGameOnlineCount gameSlug={party.gameSlug} />
                ) : null}
                {/*
                  PartyConfigSync below already renders one of these per member
                  who is missing the game once nobody has a reference install
                  (referenceSource === "party") — that includes the viewer, so
                  showing this one too duplicated the exact same install card.
                  Once someone installs, referenceSource flips to "host" and
                  this one becomes the only source again.
                */}
                {party.gameSlug && party.configSync?.referenceSource !== "party" ? (
                  <PartyHostInstallPicker
                    partyId={party.id}
                    gameSlug={party.gameSlug}
                    editionSlug={party.editionSlug}
                  />
                ) : null}
                {party.gameSlug === "openra" ? (
                  <label className="mt-2 block">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Which OpenRA game?
                    </span>
                    <PremiumSelect
                      value={party.openRaMod || ""}
                      onChange={(e) => void setOpenRaMod(party.id, e.target.value || null)}
                    >
                      <option value="">Red Alert (default)</option>
                      {OPENRA_MODS.filter((m) => m !== "ra").map((m) => (
                        <option key={m} value={m}>
                          {OPENRA_MOD_LABELS[m]}
                        </option>
                      ))}
                    </PremiumSelect>
                    <p className="mt-1 text-xs text-muted-foreground">
                      OpenRA&apos;s official client bundles all three — set this to whichever one
                      you&apos;re actually hosting, or joiners get rejected as &quot;incompatible
                      mod&quot;.
                    </p>
                  </label>
                ) : null}
              </div>
            ) : hasGame ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Game
                </p>
                <p className="mt-1 text-sm font-semibold">{party.gameTitle || party.gameSlug}</p>
                {!couchMode && party.hostModes && party.hostModes.length > 1 ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Host:{" "}
                    {/*
                      "My computer" is the hostMode option's own label, written
                      from the leader's point of view — showing it to everyone
                      else says the game runs on THEIR PC, which is only true
                      for the leader. Naming the actual person is correct for
                      every viewer.
                    */}
                    {party.hostMode === "self"
                      ? party.leaderUsername || "Party leader"
                      : party.hostModes.find((o) => o.mode === party.hostMode)?.label ||
                        (party.hostMode === "public" ? "Public server" : "PlayBound server")}
                  </p>
                ) : null}
{/*
                  Sits under the game, before anybody readies up, because the
                  host picker hides itself when there is only one mode — so
                  without this a couch party looks exactly like an online one
                  right up until Start Game.
                */}
                {couchMode ? (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-primary">
                      Couch co-op · no online play
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Runs on {isLeader ? "your PC" : `${party.leaderUsername || "the host"}'s PC`}.
                      Everyone else plays on it with their phone as a controller.
                    </p>
                  </div>
                ) : null}
                {party.gameSlug && !publicMode && !couchMode ? (
                  <PartyGameOnlineCount gameSlug={party.gameSlug} />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The leader hasn&apos;t picked a game yet.
              </p>
            )}
          </div>

          {session?.user && party.gameSlug ? (
            <div className="min-w-0">
              <PartyConfigSync
                partyId={party.id}
                gameSlug={party.gameSlug}
                editionSlug={party.editionSlug}
                currentUserId={session.user.id}
              />
            </div>
          ) : null}
        </div>

        {/*
          * Full width, and last: this is the step after ready-up, so it reads in
          * the order it is done rather than as a footnote beside the game.
          */}
        {publicMode && party.gameSlug ? (
          <div className="border-t border-border p-4">
            <PartyPublicServerPicker
              partyId={party.id}
              gameSlug={party.gameSlug}
              selectedId={party.publicServer?.id}
              selectedName={party.publicServer?.name || party.hosted?.name}
              selectedHost={party.publicServer?.host || party.hosted?.host}
              selectedPort={party.publicServer?.port || party.hosted?.port}
              gate={publicServerGate}
              onReadyUp={
                publicServerGate === "ready" ? () => void setReady(party.id, true) : undefined
              }
            />
          </div>
        ) : null}

        {/*
          * Server controls for a PlayBound-hosted room. Renders nothing unless
          * the party actually has one this game declares settings for, so it
          * stays absent for self-hosted, public and non-hostable parties.
          */}
        {party.gameSlug ? (
          <div className="border-t border-border p-4">
            <PartyServerSettings partyId={party.id} />
          </div>
        ) : null}
      </div>

      {/* Members */}
      <div className="p-4 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members</h4>
        <ul className="space-y-1">
          {party.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between p-2 rounded-md hover:bg-secondary/40">
              <div className="flex items-center gap-3">
                <div className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${m.ready ? 'bg-green-500/20 text-green-600' : 'bg-muted'}`}>
                  {m.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    {m.username}
                    {m.role === "leader" && <Crown className="size-3.5 text-primary" />}
                    {m.userId === userId && <span className="text-xs text-muted-foreground font-normal">(You)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.ready ? "Ready" : "Not ready"}
                  </p>
                </div>
              </div>

              {isLeader && m.userId !== userId && (
                <div className="flex gap-2">
                  <button onClick={() => void transferLeadership(party.id, m.userId)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" title="Make Leader">
                    <Crown className="size-4" />
                  </button>
                  <button onClick={() => void removeMember(party.id, m.userId)} className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive" title="Kick">
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="p-4 bg-muted/50 border-t border-border flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-3">
          {actions.ready.visible && (
            <button
              disabled={!actions.ready.enabled}
              onClick={() => void setReady(party.id, !isReady)}
              className={partyButtonClass(actions.ready.tone)}
              title={actions.ready.title || undefined}
            >
              <PartyActionIconView icon={actions.ready.icon} />
              {actions.ready.label}
            </button>
          )}

          {actions.join.visible && (
            <div className="flex flex-col gap-1">
              {waitForHostedRoom || (!joinHref && !joinOpensBrowser) ? (
                <button
                  type="button"
                  disabled={!actions.join.enabled}
                  onClick={(e) => handleJoinGame(e)}
                  className={partyButtonClass(actions.join.tone)}
                  title={actions.join.title || undefined}
                >
                  <PartyActionIconView icon={actions.join.icon} />
                  {actions.join.label}
                </button>
              ) : (
                <a
                  href={joinHref || "#"}
                  target={joinOpensBrowser ? "_blank" : undefined}
                  rel={joinOpensBrowser ? "noopener noreferrer" : undefined}
                  aria-disabled={!actions.join.enabled}
                  title={actions.join.title || undefined}
                  onClick={(e) => {
                    if (!actions.join.enabled) {
                      e.preventDefault();
                      return;
                    }
                    handleJoinGame(e);
                  }}
                  className={partyButtonClass(
                    actions.join.tone,
                    actions.join.enabled ? "" : "pointer-events-none opacity-50"
                  )}
                >
                  <PartyActionIconView icon={actions.join.icon} />
                  {actions.join.label}
                </a>
              )}
              {party.hosted?.roomCode ? (
                <p className="text-xs text-primary font-mono font-bold">
                  Room Code: {party.hosted.roomCode}
                </p>
              ) : joinUrl ? (
                <p className="text-xs text-muted-foreground font-mono">
                  {party.hosted?.host}:{party.hosted?.port}
                </p>
              ) : null}
              {!joinOpensBrowser && (
                <p className="text-xs text-muted-foreground">
                  Nothing happened?{" "}
                  <Link
                    href="/launcher"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <HardDriveDownload className="size-3" /> Get the PlayBound launcher
                  </Link>
                </p>
              )}
            </div>
          )}

          {party.hosted?.enabled && party.hosted.status === "pending" && (
            <p className="text-xs text-muted-foreground self-center">
              Starting PlayBound server…
            </p>
          )}

          {party.hosted?.enabled && party.hosted.status === "ready" && party.hosted.host && (
            <div className="flex items-center gap-2 self-center text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-md border border-border/50">
              <span className="font-semibold text-foreground/80">Server:</span>
              <span className="font-mono font-medium text-foreground select-text">
                {party.gameSlug === "hurry-curry"
                  ? `ws://${party.hosted.host}:${party.hosted.port}`
                  : `${party.hosted.host}:${party.hosted.port}`}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  const target = e.currentTarget;
                  const addr =
                    party.gameSlug === "hurry-curry"
                      ? `ws://${party.hosted?.host}:${party.hosted?.port}`
                      : `${party.hosted?.host}:${party.hosted?.port}`;
                  void navigator.clipboard?.writeText(addr);
                  target.textContent = "Copied!";
                  setTimeout(() => {
                    target.textContent = "Copy IP";
                  }, 2000);
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/15 hover:bg-primary/25 text-primary cursor-pointer transition-colors"
                title="Copy server IP address"
              >
                Copy IP
              </button>
            </div>
          )}

          {publicMode &&
            party.hosted?.enabled &&
            party.hosted.status !== "ready" &&
            canJoinGame && (
              <p className="text-xs text-muted-foreground self-center">
                Now pick a server under <span className="font-semibold">Public server</span> above.
              </p>
            )}

          {party.hosted?.enabled && party.hosted.status === "failed" && (
            <div className="flex items-center gap-2 self-center text-xs text-destructive select-text">
              <span>{party.hosted.error || "Could not start the PlayBound server."}</span>
              <button
                type="button"
                onClick={(e) => {
                  const target = e.currentTarget;
                  const text = party.hosted?.error || "Could not start the PlayBound server.";
                  void navigator.clipboard?.writeText(text);
                  target.textContent = "Copied!";
                  setTimeout(() => {
                    target.textContent = "Copy";
                  }, 2000);
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/15 hover:bg-destructive/25 text-destructive cursor-pointer transition-colors"
                title="Copy error to clipboard"
              >
                Copy
              </button>
            </div>
          )}

          {party.hosted?.enabled &&
            Array.isArray(party.hosted.steps) &&
            party.hosted.steps.length > 0 && (
              <ol className="w-full text-xs text-muted-foreground list-decimal list-inside space-y-0.5 self-start">
                {party.hosted.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}

          {actions.couch &&
            (actions.couch.status === "ready" && actions.couch.joinCode ? (
              <div className="w-full space-y-1 self-start">
                <p className="text-sm font-semibold">
                  Phone controllers · code {actions.couch.joinCode}
                </p>
                <p className="text-xs text-muted-foreground">
                  Open {actions.couch.joinUrl} on your phone. It becomes a controller plugged
                  into the host&apos;s PC.
                </p>
              </div>
            ) : (
              <p className={partyNoteClass(actions.couch.status === "failed" ? "error" : "info")}>
                {actions.couch.note}
              </p>
            ))}

          {/*
            Hosted and LAN notes, resolved server-side. The launcher renders the
            same list in the same order from the same field.
          */}
          {actions.notes.map((note) => (
            <p key={`${note.tone}:${note.text}`} className={partyNoteClass(note.tone)}>
              {note.text}
            </p>
          ))}

        </div>

        <div className="flex items-center gap-3">
          {party.voiceEnabled || party.discord.inviteUrl || party.discord.voiceChannelId ? (
            <button
              type="button"
              disabled={voiceBusy}
              onClick={() => void handleLaunchVoice()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Phone className="size-3.5" /> {voiceBusy ? "Opening…" : "Launch Voice"}
            </button>
          ) : null}

          <button
            onClick={() => {
              if (isLeader && party.members.length === 1) void endParty(party.id);
              else void leaveParty(party.id);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-destructive hover:bg-destructive/10 text-sm font-medium transition-colors"
          >
            <LogOut className="size-3.5" />
            {isLeader && party.members.length === 1 ? "End Party" : "Leave"}
          </button>
        </div>
        {voiceError ? (
          <p className="w-full text-xs text-destructive">{voiceError}</p>
        ) : null}
      </div>
      <PartyChat
        partyId={party.id}
        inviteUrl={party.discord?.inviteUrl}
      />
      <DiscordLinkPrompt
        open={discordPrompt.open}
        inviteUrl={discordPrompt.inviteUrl}
        onClose={() => setDiscordPrompt({ open: false, inviteUrl: null })}
      />
    </div>
  );
}
