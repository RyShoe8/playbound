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
  const cover = event.coverImage;

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
    >
      {cover ? (
        <div className="relative h-40 w-full overflow-hidden bg-secondary/60">
          <img
            src={cover}
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
            {isLive ? (
              <span className="rounded-md bg-red-600/90 px-2 py-0.5 shadow-sm backdrop-blur-md">
                ● Live now
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-md">
              <TypeIcon className="size-3" />
              {eventTypeLabel(String(event.eventType))}
            </span>
            {event.featured ? (
              <span className="rounded-md bg-primary/90 px-2 py-0.5 text-primary-foreground shadow-sm backdrop-blur-md">
                Featured
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-5 pb-0">
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
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <p className="text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {event.title}
        </p>
        {(gameTitle || event.gameSlug) && (
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {gameTitle || event.gameSlug}
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 text-primary/80" />
          <EventLocalWhen startsAt={event.startsAt} endsAt={event.endsAt} />
        </p>
        {event.description.trim() ? (
          <p className="mt-2.5 line-clamp-2 flex-1 text-sm text-muted-foreground/90">
            {event.description}
          </p>
        ) : (
          <div className="mt-2 flex-1" />
        )}
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs font-semibold text-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5 text-primary" />
            {going} going
            {event.maxParticipants ? ` / ${event.maxParticipants}` : ""}
          </span>
          <span className="text-primary group-hover:underline">View details →</span>
        </div>
      </div>
    </Link>
  );
}
