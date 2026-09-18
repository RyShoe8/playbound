"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Users, Trophy, Sparkles, ArrowRight } from "lucide-react";

type PlatformEvent = {
  id: string;
  title: string;
  eventType: string;
  gameSlug?: string | null;
  gameTitle?: string | null;
  startsAt: string;
  endsAt?: string | null;
  rsvpCount?: number;
  featured?: boolean;
};

export function MultiplayerEvents() {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      try {
        const res = await fetch("/api/events?limit=6");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && Array.isArray(data.events)) {
          setEvents(data.events.slice(0, 4));
        }
      } catch (err) {
        console.error("Failed to load multiplayer events:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border/50 bg-secondary/10 p-5">
        <div className="h-4 w-32 rounded bg-secondary/60" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-28 rounded-xl bg-secondary/40" />
          <div className="h-28 rounded-xl bg-secondary/40" />
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return null; // Omit cleanly when there are no scheduled events
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          Upcoming Multiplayer Events & Game Nights
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
        {events.map((event) => {
          const starts = new Date(event.startsAt);
          const isToday = new Date().toDateString() === starts.toDateString();
          const timeStr = isToday
            ? `Today at ${starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : starts.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
