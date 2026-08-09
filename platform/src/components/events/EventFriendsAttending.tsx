"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FriendRow = {
  userId: string;
  username: string;
  rsvpStatus: string | null;
  presence: { status?: string; currentGameId?: string | null };
};

export function EventFriendsAttending({ eventId }: { eventId: string }) {
  const [friends, setFriends] = useState<FriendRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/events/${eventId}/friends`)
      .then((r) => (r.ok ? r.json() : { friends: [] }))
      .then((data) => {
        if (!cancelled) setFriends(data.friends || []);
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!friends || friends.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Your friends
      </h2>
      <ul className="mt-3 space-y-2">
        {friends.map((f) => {
          const playing = f.presence?.status === "playing";
          const online = f.presence?.status && f.presence.status !== "offline";
          return (
            <li key={f.userId} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/users/${encodeURIComponent(f.username)}`}
                className="font-semibold hover:underline"
              >
                <span
                  className={`mr-2 inline-block size-2 rounded-full ${
                    playing ? "bg-violet-400" : online ? "bg-emerald-400" : "bg-muted-foreground/40"
                  }`}
                />
                {f.username}
              </Link>
              <span className="text-xs font-medium capitalize text-muted-foreground">
                {f.rsvpStatus === "going" ? "Going" : "Maybe"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
