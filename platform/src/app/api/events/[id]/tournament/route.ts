import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { Tournament, TournamentParticipant } from "@/lib/models/Tournament";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { completeMatch, generateSingleElimBracket } from "@/lib/events/bracket";

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return null;
  return session;
}

/** POST generate bracket / check-in / complete match */
export async function POST(req: Request, ctx: Ctx) {
  const { id: eventId } = await ctx.params;
  if (!Types.ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  await dbConnect();
  const event = await PlatformEvent.findById(eventId);
  if (!event || event.eventType !== "tournament") {
    return NextResponse.json({ error: "Not a tournament" }, { status: 404 });
  }
  const tournament = await Tournament.findOne({ eventId: event._id });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not set up" }, { status: 404 });
  }

  if (action === "generate_bracket") {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    try {
      const result = await generateSingleElimBracket(String(tournament._id));
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json(
        { error: (err as Error).message },
        { status }
      );
    }
  }

  if (action === "check_in") {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const targetUserId =
      (await requireAdmin()) && body.userId
        ? String(body.userId)
        : session.user.id;
    const p = await TournamentParticipant.findOneAndUpdate(
      { tournamentId: tournament._id, userId: targetUserId },
      {
        $set: { state: "checked_in", checkedInAt: new Date() },
      },
      { returnDocument: "after" }
    );
    if (!p) {
      return NextResponse.json(
        { error: "Not registered for this tournament" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, state: p.state });
  }

  if (action === "complete_match") {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const schema = z.object({
      matchId: z.string(),
      winnerParticipantId: z.string(),
      scoreA: z.number().nullable().optional(),
      scoreB: z.number().nullable().optional(),
    });
    try {
      const parsed = schema.parse(body);
      await completeMatch(parsed);
      return NextResponse.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
      }
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json(
        { error: (err as Error).message },
        { status }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
