"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { withOutboundUtm } from "@/lib/utm";
import { PlayCta } from "@/components/GameCard";
import { launcherJoinUrl } from "@/lib/launcher";
import type { Game } from "@/lib/data/types";
import { openDiscordInvite } from "@/lib/openPlayboundDeepLink";

/**
 * How long Join Discord waits for the room's own invite before opening the
 * event invite it already has. Chrome drops a discord:// launch that arrives
 * more than ~5s after the click, so a slow round trip must not hold it.
 */
const ROOM_INVITE_WAIT_MS = 2000;

export function EventActionBar({
  eventId,
  gameSlug,
  discordInviteUrl,
  startsAt,
  endsAt,
  discordRoomReady,
  isLive,
  game,
  hostedServer,
}: {
  eventId: string;
  gameSlug?: string | null;
  discordInviteUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  discordRoomReady: boolean;
  isLive: boolean;
  game?: Game | null;
  hostedServer?: { host: string; port: number; name: string; mod: string | null } | null;
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
        // A signed-in visitor can repair a missed cron attempt. This only
        // ensures the room; it never moves or launches Discord in the background.
        let res = await fetch(`/api/events/${eventId}/discord`, {
          method: "PUT",
          cache: "no-store",
        });
        // Signed-out visitors cannot ensure a room, but they should still see
        // it become ready when cron provisions it.
        if (res.status === 401) {
          res = await fetch(`/api/events/${eventId}/discord`, { cache: "no-store" });
        }
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
      const request = fetch(`/api/events/${eventId}/discord`, { method: "POST" }).then(
        async (res) => ({
          ok: res.ok,
          data: (await res.json().catch(() => ({}))) as { error?: string; inviteUrl?: string | null },
        })
      );
      const result = await Promise.race([
        request,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ROOM_INVITE_WAIT_MS)),
      ]);
      // A failed room request still opens the event invite: the click should land in Discord either way.
      openDiscordInvite(result?.data.inviteUrl || discord);
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
      {hostedServer && gameSlug && <a
        href={launcherJoinUrl(gameSlug, hostedServer.host, hostedServer.port, hostedServer.name, hostedServer.mod)}
        className="inline-flex items-center rounded-full bg-play px-5 py-2.5 text-sm font-bold text-play-foreground hover:brightness-110"
      >Join PlayBound Server{isLive ? "" : " Early"}</a>}
      {!hostedServer && game && isLive ? (
        <PlayCta game={game} size="md" />
      ) : !hostedServer && gameSlug ? (
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
