import Link from "next/link";
import { listPublicEvents } from "@/lib/events/service";
import { CalendarDays, Users } from "lucide-react";

export async function GameUpcomingEvents({ gameSlug }: { gameSlug: string }) {
  const events = await listPublicEvents({ gameSlug, limit: 5 });
  if (!events.length) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Upcoming events
      </h2>
      <ul className="mt-3 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/events/${e.id}`}
                className="font-semibold hover:text-primary hover:underline"
              >
                {e.eventType === "tournament" ? "🏆 " : e.eventType === "party" ? "🎉 " : "🎉 "}
                {e.title}
              </Link>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3" />
                {e.when.dateLine} · {e.when.timeLine}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {e.counts?.going ?? 0} going
                {e.eventType === "tournament"
                  ? " · Tournament"
                  : e.eventType === "party"
                    ? " · Party"
                    : ""}
              </p>
            </div>
            <Link
              href={`/events/${e.id}`}
              className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold hover:bg-secondary/80"
            >
              {e.eventType === "tournament" ? "Register" : "View event"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
