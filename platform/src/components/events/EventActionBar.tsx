import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { withOutboundUtm } from "@/lib/utm";
import { PlayCta } from "@/components/GameCard";
import type { Game } from "@/lib/data/types";

export function EventActionBar({
  eventId,
  gameSlug,
  discordInviteUrl,
  isLive,
  game,
}: {
  eventId: string;
  gameSlug?: string | null;
  discordInviteUrl?: string | null;
  isLive: boolean;
  game?: Game | null;
}) {
  const discord = withOutboundUtm(discordInviteUrl || SITE_DISCORD_INVITE, {
    campaign: "event_discord",
    content: eventId,
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={discord}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-5 py-2.5 text-sm font-bold hover:bg-primary/25"
      >
        <MessagesSquare className="size-4" />
        Join Discord
      </a>
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
    </div>
  );
}
