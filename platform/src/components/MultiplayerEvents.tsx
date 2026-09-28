"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Users, Trophy, Sparkles, ArrowRight } from "lucide-react";

export type PlatformEvent = {
  id: string;
  title: string;
  eventType: string;
  gameSlug?: string | null;
  gameTitle?: string | null;
  status?: string | null;
  startsAt: string;
  endsAt?: string | null;
  rsvpCount?: number;
  featured?: boolean;
};

type Props = {
  initialEvents?: PlatformEvent[];
};

/** How far ahead an event counts as "starting soon". */
export const EVENT_SOON_WINDOW_MS = 15 * 60_000;
/** Events without an end time are treated as running this long. */
const DEFAULT_EVENT_LENGTH_MS = 2 * 3600_000;

/**
 * Live now, or starting within EVENT_SOON_WINDOW_MS. Anything further out
 * lives on /events — the multiplayer page is for what you can join right now.
 */
export function isLiveOrStartingSoon(event: PlatformEvent, now: number): boolean {
  if (event.status === "cancelled" || event.status === "completed") return false;
  const starts = new Date(event.startsAt).getTime();
  if (!Number.isFinite(starts)) return false;
  const ends = event.endsAt ? new Date(event.endsAt).getTime() : starts + DEFAULT_EVENT_LENGTH_MS;
  if (event.status === "live") return now <= ends;
  return starts - now <= EVENT_SOON_WINDOW_MS && now <= ends;
}

export function MultiplayerEvents({ initialEvents }: Props = {}) {
  const [events, setEvents] = useState<PlatformEvent[]>(initialEvents ?? []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      try {
        const res = await fetch("/api/events?limit=12");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && Array.isArray(data.events)) setEvents(data.events);
      } catch (err) {
        console.error("Failed to load multiplayer events:", err);
      }
    }
    if (!initialEvents) void loadEvents();
    // Re-check the clock so an event appears 15 minutes out and drops off when it ends.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [initialEvents]);

  const visible = events.filter((event) => isLiveOrStartingSoon(event, now));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
          <Radio className="size-4 text-primary" />
          Live &amp; Starting Soon
        </h2>
        <Link
          href="/events"
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          All Events
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((event) => {
          const starts = new Date(event.startsAt);
          const live = event.status === "live" || starts.getTime() <= now;
          const minutes = Math.max(1, Math.ceil((starts.getTime() - now) / 60_000));
          const timeStr = live ? "Live now" : `Starts in ${minutes} min`;

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card/60 p-4 transition-all hover:border-primary/50 hover:bg-card/90"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  {event.eventType === "tournament" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-300 border border-amber-500/30">
                      <Trophy className="size-3" /> Tournament
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-cyan-300 border border-cyan-500/30">
                      <Sparkles className="size-3" /> Game Night
                    </span>
                  )}
                  {event.gameTitle && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {event.gameTitle}
                    </span>
                  )}
                </div>

                <h3 className="mt-2 font-bold text-foreground text-sm group-hover:text-primary transition-colors line-clamp-2">
                  {event.title}
                </h3>
              </div>

              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>{timeStr}</span>
                {typeof event.rsvpCount === "number" && (
                  <span className="flex items-center gap-1 text-foreground font-semibold">
                    <Users className="size-3 text-primary" />
                    {event.rsvpCount} going
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
