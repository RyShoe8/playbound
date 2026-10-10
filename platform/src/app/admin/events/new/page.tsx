import { canViewAdmin } from "@/lib/adminAccess";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listGames } from "@/lib/catalog";
import { eventGameOptions } from "@/lib/events/gameOptions";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  if (!canViewAdmin(session?.user?.role)) redirect("/events");

  const games = await listGames();
  const requestedGame = (await searchParams).game;
  const initialGameSlug = games.some((game) => game.slug === requestedGame) ? requestedGame : undefined;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <h1 className="text-2xl font-extrabold">New Event</h1>
      <NewEventForm
        gameOptions={eventGameOptions(games)}
        initialGameSlug={initialGameSlug}
      />
    </div>
  );
}
