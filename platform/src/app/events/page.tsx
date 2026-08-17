import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
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

export default async function EventsPage() {
  const [events, session, past, openParties] = await Promise.all([
    listPublicEvents({ limit: 80 }),
    getServerSession(authOptions),
    listPublicEvents({ includePast: true, limit: 20 }),
    listOpenPublicParties(100),
  ]);
  const isAdmin = session?.user?.role === "admin";

  const now = Date.now();
  const soon = events.filter((e) => {
    const t = new Date(e.startsAt).getTime();
    return e.status === "live" || (t >= now && t - now < 48 * 3600_000);
  });
  const gameNights = events.filter((e) => e.eventType === "game_night");
  const tournaments = events.filter((e) => e.eventType === "tournament");
  const scheduledParties = events.filter((e) => e.eventType === "party");
  const featured = events.filter((e) => e.featured);
  const pastOnly = past.filter(
    (e) => e.status === "completed" || new Date(e.endsAt).getTime() < now
  );

  const titles = new Map<string, string>();
  await Promise.all(
    [...new Set(events.map((e) => e.gameSlug).filter(Boolean) as string[])].map(
      async (slug) => {
        const g = await getGame(slug);
        if (g) titles.set(slug, g.title);
      }
    )
  );

  function Section({
    title,
    items,
  }: {
    title: string;
    items: typeof events;
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

      {events.length === 0 ? (
        <EmptyHint>No upcoming scheduled events yet. Check back soon.</EmptyHint>
      ) : (
        <>
          <Section title="Featured" items={featured} />
          <Section title="Happening soon" items={soon} />
          <Section title="Game Nights" items={gameNights} />
          <Section title="Tournaments" items={tournaments} />
          <Section title="Parties" items={scheduledParties} />
          <Section title="Upcoming" items={events} />
          <Section title="Past events" items={pastOnly.slice(0, 6)} />
        </>
      )}
    </div>
  );
}
