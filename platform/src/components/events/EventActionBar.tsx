"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { withOutboundUtm } from "@/lib/utm";
import { PlayCta } from "@/components/GameCard";
import type { Game } from "@/lib/data/types";
import {
  DISCORD_HANDOFF_MS,
  firePlayboundDeepLink,
  parseDiscordInviteCode,
} from "@/lib/openPlayboundDeepLink";

export function EventActionBar({
  eventId,
  gameSlug,
  discordInviteUrl,
  startsAt,
  endsAt,
  discordRoomReady,
  isLive,
  game,
}: {
  eventId: string;
  gameSlug?: string | null;
  discordInviteUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  discordRoomReady: boolean;
  isLive: boolean;
  game?: Game | null;
}) {
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(discordRoomReady);
  const [now, setNow] = useState(() => Date.now());
  const opensAt = useMemo(() => new Date(startsAt).getTime() - 15 * 60_000, [startsAt]);
  const closesAt = useMemo(
    () => (endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 2 * 3600_000),
    [endsAt, startsAt]
  );
  const discord = withOutboundUtm(discordInviteUrl || SITE_DISCORD_INVITE, {
    campaign: "event_discord",
    content: eventId,
  });

  useEffect(() => {
    if (roomReady) return;

    async function refreshRoomState() {
      const current = Date.now();
      if (current < opensAt || current > closesAt) return;
      try {
        const res = await fetch(`/api/events/${eventId}/discord`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ready?: boolean };
        setRoomReady(Boolean(data.ready));
      } catch {
        // The next poll retries; a status check should not surface as an error.
      }
    }

    void refreshRoomState();
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current > closesAt) {
        window.clearInterval(timer);
        return;
      }
      void refreshRoomState();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [closesAt, eventId, opensAt, roomReady]);

  const roomNote = roomReady
    ? "Discord room is open."
    : now < opensAt
      ? `Discord room opens ${new Date(opensAt).toLocaleString([], {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}.`
      : now <= closesAt
        ? "Discord room is starting…"
        : "Discord room is closed.";

  async function launchVoice() {
    setVoiceBusy(true);
    setVoiceError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/discord`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string | null;
      };
      if (!res.ok) {
        setVoiceError(data.error || "Could not launch Discord voice.");
        return;
      }

      const inviteUrl = data.inviteUrl || discord;
      const code = parseDiscordInviteCode(inviteUrl);
      if (!code) {
        window.open(inviteUrl, "_blank", "noopener,noreferrer");
        return;
      }

      firePlayboundDeepLink(`discord://-/invite/${code}`);
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
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={voiceBusy || !roomReady}
        onClick={() => void launchVoice()}
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-5 py-2.5 text-sm font-bold hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary/15"
      >
        <MessagesSquare className="size-4" />
        {voiceBusy ? "Opening…" : "Join Discord"}
      </button>
      <p suppressHydrationWarning className="text-xs text-muted-foreground">{roomNote}</p>
      {game && isLive ? (
        <PlayCta game={game} size="md" />
      ) : gameSlug ? (
        <Link
          href={`/games/${gameSlug}`}
          className="inline-flex items-center rounded-full bg-play px-5 py-2.5 text-sm font-bold text-play-foreground hover:brightness-110"
        >
          {isLive ? "Play Now" : "View game"}
        </Link>
      ) : null}
      {voiceError ? <p className="w-full text-xs text-destructive">{voiceError}</p> : null}
    </div>
  );
}
