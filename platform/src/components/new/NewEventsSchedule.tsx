"use client";

import Link from "next/link";
import { useState } from "react";
import type { SerializedEvent } from "@/lib/events/serialize";
import { EventLocalWhen } from "@/components/LocalTime";
import { eventTypeLabel } from "@/lib/events/types";

export function NewEventsSchedule({ events, titles }: {
  events: SerializedEvent[];
  titles: Record<string, string>;
}) {
  const [filter, setFilter] = useState("all");
  const visible = events.filter(event => filter === "all" || event.eventType === filter);
  return <section aria-label="Event schedule">
    <div className="new-events-filters" role="group" aria-label="Filter events">
      {[["all", "All events"], ["game_night", "Game nights"], ["tournament", "Tournaments"], ["party", "Parties"]].map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
      )}
    </div>
    <div className="new-panel new-event-schedule">
      {visible.length ? visible.map(event => <Link className="new-event-row" href={`/events/${event.id}`} key={event.id}>
        <div className="new-event-time"><EventLocalWhen startsAt={event.startsAt} endsAt={event.endsAt} /></div>
        {event.coverImage ? <img src={event.coverImage} alt={`${event.title} event artwork`} className="new-event-thumb" loading="lazy" /> : <div className="new-event-thumb new-event-placeholder" aria-hidden="true">▶</div>}
        <div className="new-event-summary">
          <p className="new-eyebrow">{event.status === "live" ? "● Live now · " : ""}{eventTypeLabel(String(event.eventType))}{event.featured ? " · Featured" : ""}</p>
          <h2>{event.title}</h2>
          <p>{event.gameSlug ? titles[event.gameSlug] || event.gameSlug : "PlayBound community"}</p>
          {event.description && <p className="new-event-description">{event.description}</p>}
        </div>
        <div className="new-event-attendance"><span>{event.counts?.going ?? 0} going{event.maxParticipants ? ` / ${event.maxParticipants}` : ""}</span><strong>View event →</strong></div>
      </Link>) : <div className="new-pad"><h2>No events scheduled here yet</h2><p>Try another category, or start a party and play now.</p><Link href="/multiplayer?startParty=1" className="new-button">Start a party</Link></div>}
    </div>
  </section>;
}
