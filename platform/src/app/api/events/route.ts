import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { canWriteAdmin } from "@/lib/adminAccess";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { eventCreationPolicy } from "@/lib/events/creationPolicy";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";
import {
  createPlatformEvent,
  eventCreateSchema,
  listPublicEvents,
} from "@/lib/events/service";
import { serializeEvent } from "@/lib/events/serialize";
import { getRsvpCounts } from "@/lib/events/rsvpCounts";
import { filterDiscoverableBySlug } from "@/lib/access/discover";

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
    const visible = await filterDiscoverableBySlug(events, (e) => e.gameSlug);
    return NextResponse.json(
      { events: visible },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("Events list error:", err);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let userId: string | null = null;
  const session = await getServerSession(authOptions);
  let role = session?.user?.role;
  if (session?.user?.id) {
    userId = session.user.id;
  } else {
    const launcherUser = await userFromLauncherBearer(req);
    if (launcherUser?._id) {
      userId = launcherUser._id.toString();
      role = launcherUser.role;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Sign in required to create an event." }, { status: 401 });
  }

  try {
    const body = eventCreateSchema.parse(await req.json());
    if (!canWriteAdmin(role)) {
      await dbConnect();
      const quota = await checkRateLimit(`event-create:${userId}`, { max: 8, windowMs: 60 * 60 * 1000 });
      if (!quota.ok) return NextResponse.json({ error: "Too many events created. Please try again later." }, { status: 429, headers: { "Retry-After": String(quota.retryAfterSec) } });
    }
    const doc = await createPlatformEvent(eventCreationPolicy(body, role), userId);

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
