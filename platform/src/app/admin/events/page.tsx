import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import CapacityReservation from "@/lib/models/CapacityReservation";
import CommunityServer from "@/lib/models/CommunityServer";
import { getRsvpCountsForEvents } from "@/lib/events/rsvpCounts";
import { serializeEvent } from "@/lib/events/serialize";
import { AdminEventsTable } from "@/components/events/AdminEventsTable";
import { NightlyPlannerPanel } from "@/components/events/NightlyPlannerPanel";

export default async function AdminEventsPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/");

  await dbConnect();
  const docs = await PlatformEvent.find({})
    .sort({ startsAt: -1 })
    .limit(100)
    .lean();
  const counts = await getRsvpCountsForEvents(docs.map((d) => d._id));
  const nightlyIds = docs.filter((d) => d.generatedBy === "game_night_planner").map((d) => d._id);
  const reservations = nightlyIds.length
    ? await CapacityReservation.find({ eventId: { $in: nightlyIds }, state: { $in: ["planned", "active", "missed"] } })
      .select({ eventId: 1, state: 1, communityServerId: 1, decisionReason: 1 }).lean()
    : [];
  const serverIds = reservations.filter((r) => r.communityServerId).map((r) => r.communityServerId);
  const hosted = serverIds.length
    ? await CommunityServer.find({ _id: { $in: serverIds } }).select({ runtimeState: 1, health: 1, playerCountCheckedAt: 1, decisionReason: 1 }).lean()
    : [];
  const reservationsByEvent = new Map(reservations.map((r) => [String(r.eventId), r]));
  const serversById = new Map(hosted.map((s) => [String(s._id), s]));
  const events = docs.map((d) => ({
    ...serializeEvent(d, counts.get(String(d._id))),
    rawStatus: d.status,
    hostingStatus: d.generatedBy === "game_night_planner" ? (() => {
      const reservation = reservationsByEvent.get(String(d._id));
      if (!reservation) return "Event only · no verified hosting profile";
      const server = reservation.communityServerId ? serversById.get(String(reservation.communityServerId)) : null;
      if (server?.runtimeState === "running" && server.health === "healthy" && server.playerCountCheckedAt && Date.now() - new Date(server.playerCountCheckedAt).getTime() < 30 * 60_000) return "Hosted · ready";
      return reservation.decisionReason || server?.decisionReason || (reservation.state === "active" ? "Hosted · starting" : "Hosted · reserved");
    })() : null,
  }));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Events</h1>
          <p className="text-sm text-muted-foreground">
            Manage Game Nights and tournaments.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          New event
        </Link>
      </div>
      <NightlyPlannerPanel />
      <AdminEventsTable events={events} />
    </div>
  );
}
