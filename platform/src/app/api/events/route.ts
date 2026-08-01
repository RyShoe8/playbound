import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { getGame } from "@/lib/catalog";

const eventSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(2000),
  gameSlug: z.string().nullable().optional(),
  startsAt: z.string().datetime().or(z.string().min(1)),
});

export async function GET() {
  try {
    await dbConnect();
    const events = await PlatformEvent.find({ startsAt: { $gte: new Date() } })
      .sort({ startsAt: 1 })
      .limit(50)
      .lean();
    return NextResponse.json(
      {
        events: events.map((e) => ({
          id: String(e._id),
          title: e.title,
          description: e.description,
          gameSlug: e.gameSlug || null,
          startsAt: new Date(e.startsAt).toISOString(),
        })),
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
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
    const body = eventSchema.parse(await req.json());
    if (body.gameSlug && !(await getGame(body.gameSlug))) {
      return NextResponse.json({ error: "Unknown game" }, { status: 400 });
    }

    await dbConnect();
    await PlatformEvent.create({
      title: body.title,
      description: body.description,
      gameSlug: body.gameSlug || null,
      startsAt: new Date(body.startsAt),
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Event creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
