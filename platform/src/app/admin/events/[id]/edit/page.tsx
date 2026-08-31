import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { listGames } from "@/lib/catalog";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { Tournament } from "@/lib/models/Tournament";
import { EditEventForm } from "./EditEventForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/events");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await dbConnect();
  const doc = await PlatformEvent.findById(id).lean();
  if (!doc) notFound();

  let tournamentFormat: string | null = null;
  let teamSize = 1;
  if (doc.eventType === "tournament") {
    const t = await Tournament.findOne({ eventId: doc._id }).lean();
    if (t) {
      tournamentFormat = t.format || "single_elim";
      teamSize = t.teamSize || 1;
    }
  }

  const games = await listGames();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <h1 className="text-2xl font-extrabold">Edit Event</h1>
      <EditEventForm
        eventId={String(doc._id)}
        initialValues={{
          title: doc.title,
          description: doc.description || "",
          eventType: doc.eventType || "game_night",
          gameSlug: doc.gameSlug || "",
          coverImage: doc.coverImage || null,
          startsAt: doc.startsAt ? new Date(doc.startsAt).toISOString() : "",
          endsAt: doc.endsAt ? new Date(doc.endsAt).toISOString() : "",
          maxParticipants: doc.maxParticipants ?? null,
          discordInviteUrl: doc.discordInviteUrl || "",
          featured: Boolean(doc.featured),
          visibility: doc.visibility || "public",
          status: doc.status || "registration_open",
          tournamentFormat,
          teamSize,
        }}
        gameOptions={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          coverImage: g.coverImage || null,
        }))}
      />
    </div>
  );
}
