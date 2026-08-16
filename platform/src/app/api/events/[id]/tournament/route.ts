import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";
import dbConnect from "@/lib/db";
import { Tournament, TournamentParticipant } from "@/lib/models/Tournament";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { completeMatch, generateSingleElimBracket } from "@/lib/events/bracket";
import { createTeam, joinTeam, kickFromTournament, leaveTeam } from "@/lib/events/teams";

type Ctx = { params: Promise<{ id: string }> };

async function getUserAndRole(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      isAdmin: session.user.role === "admin",
    };
  }
  const launcherUser = await userFromLauncherBearer(req);
  if (launcherUser?._id) {
    return {
      userId: launcherUser._id.toString(),
      isAdmin: launcherUser.role === "admin",
    };
  }
  return null;
}

/** POST generate bracket / check-in / complete match */
export async function POST(req: Request, ctx: Ctx) {
  const { id: eventId } = await ctx.params;
  if (!Types.ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await getUserAndRole(req);
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
    if (!auth?.isAdmin) {
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
    if (!auth?.userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const targetUserId = auth.isAdmin && body.userId ? String(body.userId) : auth.userId;
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

  if (action === "create_team") {
    if (!auth?.userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    try {
      const team = await createTeam({
        tournamentId: tournament._id,
        userId: auth.userId,
        name: String(body.name || ""),
      });
      return NextResponse.json({ success: true, teamId: String(team._id) });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  }

  if (action === "join_team") {
    if (!auth?.userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    try {
      await joinTeam({
        tournamentId: tournament._id,
        userId: auth.userId,
        teamId: String(body.teamId || ""),
        teamSize: tournament.teamSize || 1,
      });
      return NextResponse.json({ success: true });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  }

  if (action === "leave_team") {
    if (!auth?.userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    try {
      await leaveTeam({ tournamentId: tournament._id, userId: auth.userId });
      return NextResponse.json({ success: true });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  }

  if (action === "kick") {
    if (!auth?.isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    try {
      await kickFromTournament({
        tournamentId: tournament._id,
        eventId: event._id,
        userId: body.userId ? String(body.userId) : undefined,
        teamId: body.teamId ? String(body.teamId) : undefined,
      });
      return NextResponse.json({ success: true });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  }

  if (action === "complete_match") {
    if (!auth?.isAdmin) {
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
