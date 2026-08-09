import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { setEventRsvp } from "@/lib/events/rsvp";
import { createEventRsvpNotification } from "@/lib/events/notifications";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["going", "maybe", "not_going"]),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = schema.parse(await req.json());
    const result = await setEventRsvp({
      eventId: id,
      userId: session.user.id,
      status: body.status,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    await dbConnect();
    const event = await PlatformEvent.findById(id).select({ title: 1, gameSlug: 1 }).lean();
    if (event && (body.status === "going" || body.status === "maybe")) {
      void createEventRsvpNotification({
        userId: session.user.id,
        eventId: id,
        eventTitle: event.title,
        status: body.status,
      });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      counts: result.counts,
      gameSlug: event?.gameSlug || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("RSVP error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
