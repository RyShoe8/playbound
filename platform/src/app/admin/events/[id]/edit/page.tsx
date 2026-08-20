import { redirect, notFound } from "next/navigation";
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

  // Serialise dates into local ISO format for datetime-local inputs
  function toLocalInput(d: Date | string | null | undefined): string {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    // Offset to local and chop off seconds + TZ
    const offset = dt.getTimezoneOffset() * 60_000;
    return new Date(dt.getTime() - offset).toISOString().slice(0, 16);
  }

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
          startsAt: toLocalInput(doc.startsAt),
          endsAt: toLocalInput(doc.endsAt),
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
