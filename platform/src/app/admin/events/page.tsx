import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { getRsvpCountsForEvents } from "@/lib/events/rsvpCounts";
import { serializeEvent } from "@/lib/events/serialize";
import { AdminEventsTable } from "@/components/events/AdminEventsTable";

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
  const events = docs.map((d) => ({
    ...serializeEvent(d, counts.get(String(d._id))),
    rawStatus: d.status,
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
      <AdminEventsTable events={events} />
    </div>
  );
}
