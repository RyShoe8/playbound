import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { filterDiscoverableBySlug } from "@/lib/access/discover";
import { getGame } from "@/lib/catalog";
import { listPublicEvents } from "@/lib/events/service";
import { listOpenPublicParties } from "@/lib/playTogether/party";
import { EmptyHint } from "@/components/ui/bits";
import { EventCard } from "@/components/events/EventCard";
import { OpenPartiesSection } from "@/components/events/OpenPartiesSection";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Events, Game Nights & Parties",
  description:
    "Find PlayBound Game Nights, tournaments, and open parties — see who's going, join Discord, and play together.",
  path: "/events",
});

export const dynamic = "force-dynamic";

type ListedEvent = Awaited<ReturnType<typeof listPublicEvents>>[number];

/** Pull matching events into one exclusive bucket so a card never repeats. */
function takeExclusive(
  pool: ListedEvent[],
  claimed: Set<string>,
  predicate: (e: ListedEvent) => boolean
): ListedEvent[] {
  const items = pool.filter((e) => !claimed.has(e.id) && predicate(e));
  for (const e of items) claimed.add(e.id);
  return items;
}

export default async function EventsPage() {
  const [eventsRaw, session, pastRaw, openPartiesRaw] = await Promise.all([
    listPublicEvents({ limit: 80 }),
    getServerSession(authOptions),
    listPublicEvents({ includePast: true, limit: 40 }),
    listOpenPublicParties(100),
  ]);
  const [events, past, openParties] = await Promise.all([
    filterDiscoverableBySlug(eventsRaw, (e) => e.gameSlug),
    filterDiscoverableBySlug(pastRaw, (e) => e.gameSlug),
    filterDiscoverableBySlug(openPartiesRaw, (p) => p.gameSlug),
  ]);
  const isAdmin = session?.user?.role === "admin";

  const now = Date.now();
  const activeIds = new Set(events.map((e) => e.id));
  const pastOnly = past
    .filter(
      (e) =>
        !activeIds.has(e.id) &&
        (e.status === "completed" ||
          e.status === "cancelled" ||
          (e.endsAt ? new Date(e.endsAt).getTime() < now : false))
    )
    .sort(
      (a, b) =>
        new Date(b.endsAt || b.startsAt).getTime() -
        new Date(a.endsAt || a.startsAt).getTime()
    );

  /*
   * One card, one section. Priority: imminent/live → featured → type → leftover.
   * Without exclusivity a featured live Game Night landed in three sections.
   */
  const claimed = new Set<string>();
  const soon = takeExclusive(
    events,
    claimed,
    (e) => {
      const t = new Date(e.startsAt).getTime();
      return e.status === "live" || (t >= now && t - now < 48 * 3600_000);
    }
  );
  const featured = takeExclusive(events, claimed, (e) => Boolean(e.featured));
  const gameNights = takeExclusive(events, claimed, (e) => e.eventType === "game_night");
  const tournaments = takeExclusive(events, claimed, (e) => e.eventType === "tournament");
  const scheduledParties = takeExclusive(events, claimed, (e) => e.eventType === "party");
  const upcoming = events.filter((e) => !claimed.has(e.id));

  const titles = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        [...events, ...pastOnly]
          .map((e) => e.gameSlug)
          .filter(Boolean) as string[]
      ),
    ].map(async (slug) => {
      const g = await getGame(slug);
      if (g) titles.set(slug, g.title);
    })
  );

  function Section({
    title,
    items,
  }: {
    title: string;
    items: ListedEvent[];
  }) {
    if (!items.length) return null;
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              gameTitle={e.gameSlug ? titles.get(e.gameSlug) : null}
            />
          ))}
        </div>
      </section>
    );
  }

  const hasActive = events.length > 0;

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Events</h1>
        </div>
        {isAdmin && (
          <Link
            href="/admin/events/new"
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
          >
            <Plus className="size-4" /> New Event
          </Link>
        )}
      </div>

      <OpenPartiesSection parties={openParties} />

      {!hasActive ? (
        <EmptyHint>No upcoming scheduled events yet. Check back soon.</EmptyHint>
      ) : null}

      {hasActive ? (
        <>
          <Section title="Happening soon" items={soon} />
          <Section title="Featured" items={featured} />
          <Section title="Game Nights" items={gameNights} />
          <Section title="Tournaments" items={tournaments} />
          <Section title="Parties" items={scheduledParties} />
          <Section title="Upcoming" items={upcoming} />
        </>
      ) : null}

      {/* Past stays visible even when nothing is live or upcoming. */}
      <Section title="Past events" items={pastOnly.slice(0, 6)} />
    </div>
  );
}
