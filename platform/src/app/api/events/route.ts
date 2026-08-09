import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { Tournament } from "@/lib/models/Tournament";
import {
  createPlatformEvent,
  eventCreateSchema,
  listPublicEvents,
} from "@/lib/events/service";
import { serializeEvent } from "@/lib/events/serialize";
import { getRsvpCounts } from "@/lib/events/rsvpCounts";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gameSlug = url.searchParams.get("game") || url.searchParams.get("gameSlug");
    const eventType = url.searchParams.get("type") || url.searchParams.get("eventType");
    const includePast = url.searchParams.get("past") === "1";
    const events = await listPublicEvents({
      gameSlug,
      eventType,
      includePast,
      limit: 80,
    });
    return NextResponse.json(
      { events },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    console.error("Events list error:", err);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = eventCreateSchema.parse(await req.json());
    const doc = await createPlatformEvent(body, session.user.id);

    if (body.eventType === "tournament") {
      await dbConnect();
      await Tournament.create({
        eventId: doc._id,
        format: body.tournamentFormat || "single_elim",
        teamSize: body.teamSize || 1,
        checkInRequired: body.checkInRequired !== false,
      });
    }

    const counts = await getRsvpCounts(doc._id);
    return NextResponse.json(
      { success: true, event: serializeEvent(doc.toObject(), counts) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    const status = (error as { status?: number })?.status;
    if (status === 400) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }
    console.error("Event creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
