"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EventLocalWhen } from "@/components/LocalTime";

type Row = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  friendCount: number;
  friendNames: string[];
};

export function FriendsUpcomingEvents() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/events/friends-upcoming")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data) => {
        if (!cancelled) setRows(data.events || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Upcoming with friends
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="font-semibold hover:underline">
              {e.title}
            </Link>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3" />
              <EventLocalWhen startsAt={e.startsAt} endsAt={e.endsAt} />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {e.friendNames[0]}
              {e.friendCount > 1
                ? ` and ${e.friendCount - 1} other friend${e.friendCount - 1 === 1 ? "" : "s"}`
                : ""}{" "}
              going
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
