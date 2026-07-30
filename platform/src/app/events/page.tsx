import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { CalendarDays, Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { getGame } from "@/lib/catalog";
import { EmptyHint } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Free Game Events & Tournaments",
  description:
    "Upcoming tournaments, LAN nights and community events for free open-source games.",
  path: "/events",
});

interface EventDoc {
  _id: string;
  title: string;
  description: string;
  gameSlug: string | null;
  startsAt: string | Date;
}

async function getUpcomingEvents(): Promise<EventDoc[]> {
  try {
    await dbConnect();
    return await PlatformEvent.find({ startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(50).lean();
  } catch (err) {
    console.error("Failed to load events:", err);
    return [];
  }
}

export default async function EventsPage() {
  const [events, session] = await Promise.all([getUpcomingEvents(), getServerSession(authOptions)]);
  const isAdmin = session?.user?.role === "admin";
  const rows = await Promise.all(
    events.map(async (e) => ({
      e,
      game: e.gameSlug ? await getGame(e.gameSlug) : undefined,
    }))
  );

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Events</h1>
          <p className="mt-1 text-muted-foreground">Tournaments, community nights, and livestreams scheduled on PlayBound.</p>
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

      {rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ e, game }) => (
            <div key={String(e._id)} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3" /> {new Date(e.startsAt).toLocaleString()}
              </p>
              <p className="mt-2 font-bold">{e.title}</p>
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{e.description}</p>
              {game && (
                <Link href={`/games/${game.slug}`} className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
                  {game.title}
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint icon={CalendarDays}>
          No events scheduled yet. {isAdmin ? "Create the first one." : "Check back soon."}
        </EmptyHint>
      )}
    </div>
  );
}
