import Link from "next/link";
import { CalendarDays, Gamepad2, PartyPopper, Trophy, Users } from "lucide-react";
import type { SerializedEvent } from "@/lib/events/serialize";
import { eventTypeLabel } from "@/lib/events/types";
import { EventLocalWhen } from "@/components/LocalTime";

export function EventCard({
  event,
  gameTitle,
}: {
  event: SerializedEvent;
  gameTitle?: string | null;
}) {
  const isLive = event.status === "live";
  const isTournament = event.eventType === "tournament";
  const isParty = event.eventType === "party";
  const going = event.counts?.going ?? 0;
  const TypeIcon = isTournament ? Trophy : isParty ? PartyPopper : Gamepad2;

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isLive ? (
          <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-red-400">Live now</span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <TypeIcon className="size-3" />
          {eventTypeLabel(String(event.eventType))}
        </span>
        {event.featured ? (
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-primary">Featured</span>
        ) : null}
      </div>
      <p className="mt-2 text-lg font-bold leading-snug">{event.title}</p>
      {(gameTitle || event.gameSlug) && (
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {gameTitle || event.gameSlug}
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="size-3" />
        <EventLocalWhen startsAt={event.startsAt} endsAt={event.endsAt} />
      </p>
      {event.description.trim() ? (
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{event.description}</p>
      ) : (
        <div className="mt-2 flex-1" />
      )}
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
        <Users className="size-3.5" />
        {going} going
        {event.maxParticipants ? ` / ${event.maxParticipants}` : ""}
      </p>
    </Link>
  );
}
