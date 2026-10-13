import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { filterDiscoverableBySlug } from "@/lib/access/discover";
import { getGame } from "@/lib/catalog";
import { listPublicEvents } from "@/lib/events/service";
import { listOpenPublicParties } from "@/lib/playTogether/party";
import { NewEventsSchedule } from "@/components/new/NewEventsSchedule";
import { PlayWithFriends } from "@/components/friends/PlayWithFriends";
import { OpenPartiesSection } from "@/components/events/OpenPartiesSection";
import { JsonLd, graph, breadcrumbSchema, eventSchema } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Events, Game Nights & Parties",
  description:
    "Find PlayBound Game Nights, tournaments, and open parties — see who's going, join Discord, and play together.",
  path: "/events",
});

async function LiveOpenParties() {
  const parties = await listOpenPublicParties(100);
  const visible = await filterDiscoverableBySlug(parties, party => party.gameSlug);
  return <OpenPartiesSection parties={visible} />;
}

export default async function EventsPage() {
  // Per-request by nature: live data, the signed-in viewer, or both.
  // Reads the database before it reads anything request-scoped, which
  // Cache Components will not allow during a prerender.
  await connection();
  const [eventsRaw, session] = await Promise.all([
    listPublicEvents({ limit: 80 }),
    getServerSession(authOptions),
  ]);
  const events = await filterDiscoverableBySlug(eventsRaw, (e) => e.gameSlug);
  const isAdmin = session?.user?.role === "admin";

  const titles = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        events
          .map((e) => e.gameSlug)
          .filter(Boolean) as string[]
      ),
    ].map(async (slug) => {
      const g = await getGame(slug);
      if (g) titles.set(slug, g.title);
    })
  );

  return <div className="new-page new-events-page">
      <JsonLd data={graph(
        { "@type": "CollectionPage", name: "PlayBound Events & Game Nights", url: absoluteUrl("/events"), description: "Upcoming PlayBound Game Nights, tournaments, and community events." },
        breadcrumbSchema([{ name: "Events", path: "/events" }]),
        events.map(event => eventSchema({ id: event.id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, coverImage: event.coverImage, gameSlug: event.gameSlug, gameTitle: event.gameSlug ? titles.get(event.gameSlug) : null }))
      )} />
      <header className="new-page-heading"><div><p className="new-eyebrow">Your next game night</p><h1>Events & game nights</h1><p>A week of reasons to get the group together.</p></div>
        {isAdmin && <Link href="/admin/events/new" className="new-button primary"><Plus className="size-4" /> Create event</Link>}
      </header>
      <div className="new-events-layout">
        <NewEventsSchedule events={[...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))} titles={Object.fromEntries(titles)} />
        <aside className="new-events-rail">
          <section className="new-panel new-pad"><p className="new-eyebrow">Your week</p><h2>Make room for a game night</h2><p>Times are shown in your local timezone. Open an event to see its edition, RSVP, and available Join options.</p><Link href="/multiplayer" className="new-button primary">Play now</Link></section>
          <PlayWithFriends surface="new_events" compact className="new-panel new-pad" />
          <Suspense fallback={<p role="status">Loading open parties…</p>}><LiveOpenParties /></Suspense>
        </aside>
      </div>
    </div>;
}
