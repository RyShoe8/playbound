import Link from "next/link";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { CalendarDays, Users, Gamepad2 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { listGames } from "@/lib/catalog";
import { eventGameOptions } from "@/lib/events/gameOptions";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { JsonLd, graph, breadcrumbSchema } from "@/components/JsonLd";
import { NewEventForm } from "@/components/events/NewEventForm";

export const metadata = pageMetadata({ title: "Create a Game Night or Community Event", description: "Organize a Game Night, tournament, or party on PlayBound. Pick a game, set a time, invite your friends, and bring your community together.", path: "/events/create" });

export default async function CreateEventPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await connection();
  const [session, params] = await Promise.all([getServerSession(authOptions), searchParams]);
  const games = session?.user ? eventGameOptions(await listGames()).sort((a, b) => a.title.localeCompare(b.title)) : [];
  const selected = games.some(game => game.slug === params.game) ? params.game : undefined;
  const returnPath = `/events/create${params.game ? `?game=${encodeURIComponent(params.game)}` : ""}`;
  return <div className="new-page space-y-8">
    <JsonLd data={graph({ "@type": "WebPage", name: "Create a PlayBound community event", url: absoluteUrl("/events/create"), description: "Plan a Game Night, tournament, or party with friends and the PlayBound community." }, breadcrumbSchema([{ name: "Events", path: "/events" }, { name: "Create event", path: "/events/create" }]))} />
    <header className="new-page-heading"><div><p className="new-eyebrow">Bring your people together</p><h1>Create a community event</h1><p>Give your next Game Night, tournament, or party a place on the calendar.</p></div><Link className="new-button" href="/events">Browse events</Link></header>
    <div className="grid gap-4 md:grid-cols-3">
      {[
        { icon: Gamepad2, title: "Pick your game", text: "Choose a multiplayer game or organize a general community gathering." },
        { icon: CalendarDays, title: "Set the date", text: "Choose a start and end time. Players see the schedule in their own timezone." },
        { icon: Users, title: "Invite your community", text: "Publish your event, share its link, and let players RSVP. Add your Discord invite for voice chat." },
      ].map(({ icon: Icon, title, text }) => <section key={title} className="new-panel new-pad"><Icon className="size-6 text-primary" aria-hidden="true" /><h2 className="mt-3">{title}</h2><p>{text}</p></section>)}
    </div>
    <section className="new-panel new-pad">
      <h2 className="text-xl font-bold">{session?.user ? "Plan your event" : "Your next game night starts here"}</h2>
      <p>Community events are organized by their creators. Publishing an event does not automatically reserve or launch a dedicated server.</p>
      {session?.user ? <NewEventForm gameOptions={games} initialGameSlug={selected} community /> : <div className="new-actions mt-5"><Link className="new-button primary" href={`/login?callbackUrl=${encodeURIComponent(returnPath)}`}>Sign in to create an event</Link><Link className="new-button" href={`/signup?next=${encodeURIComponent(returnPath)}`}>Create a free account</Link></div>}
    </section>
  </div>;
}
