"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Users, Crown, LogOut, Check, X, Phone, Play, HardDriveDownload } from "lucide-react";
import { usePartyStore } from "@/stores/partyStore";
import type { PartyPayload } from "@/lib/playTogether/types";
import {
  PARTY_NAME_MAX,
  PARTY_VISIBILITIES,
  PARTY_VISIBILITY_LABELS,
  partyDisplayName,
} from "@/lib/playTogether/types";
import type { LaunchMethod } from "@/lib/data/types";
import { launcherJoinUrl, launcherPlayUrl } from "@/lib/launcher";
import { isBrowserGame } from "@/lib/gameLaunch";
import { launcherDownloadUrlForOs } from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  firePlayboundDeepLink,
  parseDiscordInviteCode,
  openPlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { withOutboundUtm } from "@/lib/utm";
import { DiscordLinkPrompt } from "@/components/friends/DiscordLinkPrompt";
import { PartyHostInstallPicker } from "@/components/friends/PartyHostInstallPicker";
import { PartyChat } from "@/components/friends/PartyChat";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

export type PartyGameOption = {
  slug: string;
  title: string;
  website?: string;
  launchMethods?: LaunchMethod[];
  browserPlayable?: boolean;
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
    setName,
  } = usePartyStore();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [discordPrompt, setDiscordPrompt] = useState<{ open: boolean; inviteUrl: string | null }>({
    open: false,
    inviteUrl: null,
  });

  if (!userId) return null;

  const isLeader = party.leaderId === userId;
  const me = party.members.find((m) => m.userId === userId);
  const isReady = me?.ready ?? false;
  const hasGame = Boolean(party.gameSlug);
  const canJoinGame =
    hasGame &&
    party.status !== "ended" &&
    (isReady || party.status === "playing" || party.status === "launching");
  const catalogGame = games.find((g) => g.slug === party.gameSlug);
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

  function handleJoinGame() {
    /*
     * Do not preventDefault — the <a href> is the launcher/browser handoff.
     * After join-game returns a hosted room, follow up with the join deep link
     * so the first clicker is not stuck on playbound://play with no server.
     */
    void (async () => {
      const next = await joinGame(party.id);
      const nextJoin =
        next?.hosted?.status === "ready" && next.hosted.host && next.hosted.port
          ? launcherJoinUrl(
              next.gameSlug,
              next.hosted.host,
              next.hosted.port,
              next.hosted.name || next.gameTitle || undefined
            )
          : null;
      if (nextJoin && nextJoin !== joinUrl) {
        openPlayboundDeepLink(nextJoin, {
          autoDownload: true,
          downloadUrl: launcherDownloadUrlForOs(detectLauncherOs()),
        });
      }
    })();
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-muted p-4 flex items-center justify-between border-b border-border">
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
          {/*
            * Available for as long as the party is alive, including while it is
            * playing: finishing one game and picking another is how a party
            * carries on, and changing the pick winds the party back to forming
            * server-side.
            */}
          {isLeader && party.status !== "ended" ? (
            <div className="max-w-md">
              <label className="block">
                <span className="sr-only">Party game</span>
                <PremiumSelect
                  value={party.gameSlug}
                  onChange={(e) => {
                    if (e.target.value) void setGame(party.id, e.target.value);
                  }}
                >
                  <option value="">Select a game</option>
                  {games.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.title}
                    </option>
                  ))}
                  {party.gameSlug && !games.some((g) => g.slug === party.gameSlug) ? (
                    <option value={party.gameSlug}>{party.gameTitle || party.gameSlug}</option>
                  ) : null}
                </PremiumSelect>
              </label>
              {party.gameSlug ? (
                <PartyHostInstallPicker
                  partyId={party.id}
                  gameSlug={party.gameSlug}
                  editionSlug={party.editionSlug}
                />
              ) : null}
            </div>
          ) : hasGame ? (
            <p className="text-sm font-semibold text-muted-foreground">
              {party.gameTitle || party.gameSlug}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="capitalize">{party.status.replace("_", " ")}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Users className="size-3" /> {party.members.length} / {party.maxSize}
            </span>
          </p>
        </div>
        
        {isLeader && party.status !== "ended" && (
          <div className="w-44 shrink-0">
            <PremiumSelect
              value={party.visibility}
              onChange={(e) => void setVisibility(party.id, e.target.value as PartyPayload["visibility"])}
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
          {party.status !== "ended" && party.status !== "launching" && party.status !== "playing" && (
            <button
              disabled={!hasGame}
              onClick={() => void setReady(party.id, !isReady)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-colors disabled:opacity-50 ${
                isReady 
                  ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              title={hasGame ? undefined : "Pick a game first"}
            >
              {isReady ? <X className="size-4" /> : <Check className="size-4" />}
              {isReady ? "Cancel Ready" : "Ready Up"}
            </button>
          )}

          {canJoinGame && (
            <div className="flex flex-col gap-1">
              <a
                href={joinHref || "#"}
                target={joinOpensBrowser ? "_blank" : undefined}
                rel={joinOpensBrowser ? "noopener noreferrer" : undefined}
                onClick={handleJoinGame}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary font-bold text-primary-foreground text-sm hover:bg-primary/90 shadow-sm"
              >
                <Play className="size-4 fill-current" />
                Join Game
              </a>
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
              Starting public server…
            </p>
          )}

          {party.hosted?.enabled && party.hosted.status === "failed" && (
            <p className="text-xs text-destructive self-center">
              {party.hosted.error || "Could not start the PlayBound server."}
            </p>
          )}

          {party.status === "playing" && !canJoinGame && (
            <div className="px-4 py-2 rounded-md bg-primary/20 text-primary font-bold text-sm flex items-center gap-2">
              <Play className="size-4 fill-current" /> Playing
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {party.voiceEnabled || party.discord.inviteUrl || party.discord.voiceChannelId ? (
            party.discord.inviteUrl ? (
              <a
                href={party.discord.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 text-sm font-semibold transition-colors"
                onClick={() => {
                  const code = parseDiscordInviteCode(party.discord.inviteUrl!);
                  if (code) firePlayboundDeepLink(`discord://-/invite/${code}`);
                  void provisionDiscord(party.id);
                }}
              >
                <Phone className="size-3.5" /> Launch Voice
              </a>
            ) : (
              <button
                type="button"
                disabled={voiceBusy}
                onClick={() => {
                  const pendingTab = window.open("about:blank", "_blank");
                  void (async () => {
                    setVoiceBusy(true);
                    setVoiceError(null);
                    const result = await provisionDiscord(party.id);
                    const url = result.inviteUrl;
                    if (url) {
                      if (pendingTab && !pendingTab.closed) {
                        try {
                          pendingTab.location.replace(url);
                        } catch {
                          pendingTab.close();
                          window.location.assign(url);
                        }
                      } else {
                        window.location.assign(url);
                      }
                      const code = parseDiscordInviteCode(url);
                      if (code) firePlayboundDeepLink(`discord://-/invite/${code}`);
                    } else {
                      pendingTab?.close();
                      setVoiceError(result.error || "Couldn't open Discord voice.");
                      if (result.needsDiscordLink) {
                        setDiscordPrompt({ open: true, inviteUrl: null });
                      }
                    }
                    setVoiceBusy(false);
                  })();
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <Phone className="size-3.5" /> {voiceBusy ? "Opening…" : "Launch Voice"}
              </button>
            )
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
        textChannelId={party.discord.textChannelId}
        inviteUrl={party.discord.inviteUrl}
      />
      <DiscordLinkPrompt
        open={discordPrompt.open}
        inviteUrl={discordPrompt.inviteUrl}
        onClose={() => setDiscordPrompt({ open: false, inviteUrl: null })}
      />
    </div>
  );
}
