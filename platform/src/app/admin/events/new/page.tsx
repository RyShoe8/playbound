import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listGames } from "@/lib/catalog";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/events");

  const games = await listGames();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <h1 className="text-2xl font-extrabold">New Event</h1>
      <NewEventForm
        gameOptions={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          coverImage: g.coverImage || null,
        }))}
      />
    </div>
  );
}
