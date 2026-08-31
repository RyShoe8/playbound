import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Types } from "mongoose";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import EventRsvp from "@/lib/models/EventRsvp";
import User from "@/lib/models/User";
import { userFromLauncherBearer } from "@/lib/library";
import { getGame } from "@/lib/catalog";
import { getRsvpCounts } from "@/lib/events/rsvpCounts";
import { serializeEvent } from "@/lib/events/serialize";
import { getEventPresenceAggregates } from "@/lib/events/presenceAgg";
import { syncEventAttendance } from "@/lib/events/attendance";
import { eventUpdateSchema, validateGameSlug } from "@/lib/events/service";
import {
  cleanupEventDiscordVoice,
  placeEventDiscordVoice,
  renameEventDiscordVoice,
} from "@/lib/events/discordEventProvision";
import {
  notifyEventCancelled,
  notifyEventTimeChanged,
  notifyEventUpdated,
} from "@/lib/events/notifications";
import { defaultEndsAt } from "@/lib/events/time";
import { isEventStatus } from "@/lib/events/types";
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentTeam,
} from "@/lib/models/Tournament";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await dbConnect();
    const event = await PlatformEvent.findById(id).lean();
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);

    if (event.visibility === "unlisted") {
      const isAdmin = session?.user?.role === "admin";
      const isOrg =
        session?.user?.id &&
        (String(event.organizerId || event.createdBy) === session.user.id);
      if (!isAdmin && !isOrg) {
        // Allow if user has RSVP
        const rsvp = session?.user?.id
          ? await EventRsvp.findOne({ eventId: event._id, userId: session.user.id })
          : null;
        if (!rsvp) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }
    }

    const [counts, presence, game] = await Promise.all([
      getRsvpCounts(event._id),
      getEventPresenceAggregates({
        eventId: event._id,
        gameSlug: event.gameSlug,
      }),
      event.gameSlug ? getGame(event.gameSlug) : Promise.resolve(null),
    ]);

    let myRsvp: string | null = null;
    if (session?.user?.id) {
      const r = await EventRsvp.findOne({
        eventId: event._id,
        userId: session.user.id,
      }).lean();
      myRsvp = r?.status || null;
    }

    // Soft sync attendance while live
    if (event.status === "live" || new Date() >= new Date(event.startsAt)) {
      void syncEventAttendance(String(event._id));
    }

    let organizer: { id: string; username: string } | null = null;
    const orgId = event.organizerId || event.createdBy;
    if (orgId) {
      const u = await User.findById(orgId).select({ username: 1 }).lean();
      if (u) organizer = { id: String(u._id), username: u.username || "admin" };
    }

    let tournament: Record<string, unknown> | null = null;
    if (event.eventType === "tournament") {
      const t = await Tournament.findOne({ eventId: event._id }).lean();
      if (t) {
        const [participants, matches] = await Promise.all([
          TournamentParticipant.find({ tournamentId: t._id }).lean(),
          TournamentMatch.find({ tournamentId: t._id })
            .sort({ round: 1, matchNumber: 1 })
            .lean(),
        ]);
        tournament = {
          id: String(t._id),
          format: t.format,
          teamSize: t.teamSize,
          checkInRequired: t.checkInRequired,
          bracketGeneratedAt: t.bracketGeneratedAt,
          participants: participants.map((p) => ({
            id: String(p._id),
            userId: p.userId ? String(p.userId) : null,
            teamId: p.teamId ? String(p.teamId) : null,
            seed: p.seed,
            state: p.state,
            checkedInAt: p.checkedInAt,
          })),
          matches: matches.map((m) => ({
            id: String(m._id),
            round: m.round,
            matchNumber: m.matchNumber,
            participantAId: m.participantAId ? String(m.participantAId) : null,
            participantBId: m.participantBId ? String(m.participantBId) : null,
            scheduledAt: m.scheduledAt,
            status: m.status,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            winnerParticipantId: m.winnerParticipantId
              ? String(m.winnerParticipantId)
              : null,
          })),
        };
      }
    }

    const attended = await EventRsvp.countDocuments({
      eventId: event._id,
      attendedAt: { $ne: null },
    });
    const played = await EventRsvp.countDocuments({
      eventId: event._id,
      playedAt: { $ne: null },
    });

    return NextResponse.json({
      event: serializeEvent(event, counts, game?.coverImage || null),
      game: game
        ? { slug: game.slug, title: game.title, coverImage: game.coverImage || null }
        : null,
      myRsvp,
      presence,
      organizer,
      tournament,
      metrics: {
        going: counts.going,
        maybe: counts.maybe,
        attended,
        played,
        attendanceRate: counts.going ? attended / counts.going : null,
        playRate: attended ? played / attended : null,
      },
    });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("Event detail error:", err);
    return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const launcherUser = session?.user?.id ? null : await userFromLauncherBearer(req);
  const currentUserId = session?.user?.id || (launcherUser?._id ? launcherUser._id.toString() : null);
  const isAdmin = session?.user?.role === "admin" || launcherUser?.role === "admin";

  try {
    const body = eventUpdateSchema.parse(await req.json());
    await dbConnect();
    const event = await PlatformEvent.findById(id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOrganizer = currentUserId && (String(event.organizerId || event.createdBy) === currentUserId);
    if (!isAdmin && !isOrganizer) {
      return NextResponse.json({ error: "Admin or organizer access required" }, { status: 403 });
    }

    if (body.cancel) {
      event.status = "cancelled";
      await event.save();
      // Fire-and-forget: notify all going + maybe RSVPs about cancellation.
      void notifyEventCancelled({ eventId: id, eventTitle: event.title });
      return NextResponse.json({ success: true, event: serializeEvent(event.toObject()) });
    }

    if (body.gameSlug !== undefined && !(await validateGameSlug(body.gameSlug))) {
      return NextResponse.json({ error: "Unknown game" }, { status: 400 });
    }

    /*
     * Both of these have a Discord side-effect, so the previous values are
     * captured before the assignment and acted on after the save — a rename
     * renames the event's channel, and changing the game moves it into (or
     * back out of) that game's area.
     */
    const previousTitle = event.title;
    const previousGameSlug = event.gameSlug || null;
    const previousStartsAt = new Date(event.startsAt).toISOString();
    const previousStatus = event.status;

    if (body.title != null) event.title = body.title;
    if (body.description != null) event.description = body.description;
    if (body.eventType != null) event.eventType = body.eventType;
    if (body.gameSlug !== undefined) event.gameSlug = body.gameSlug;
    if (body.coverImage !== undefined) event.coverImage = body.coverImage || null;
    if (body.editionSlug !== undefined) event.editionSlug = body.editionSlug;
    if (body.modSlugs) event.modSlugs = body.modSlugs;
    if (body.recommendedModSlugs) event.recommendedModSlugs = body.recommendedModSlugs;
    if (body.startsAt) event.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) {
      event.endsAt = body.endsAt
        ? new Date(body.endsAt)
        : defaultEndsAt(new Date(event.startsAt));
    }
    if (body.timezone) event.timezone = body.timezone;
    if (body.registrationDeadline !== undefined) {
      event.registrationDeadline = body.registrationDeadline
        ? new Date(body.registrationDeadline)
        : null;
    }
    if (body.maxParticipants !== undefined) {
      event.maxParticipants = body.maxParticipants;
    }
    if (body.status && isEventStatus(body.status)) {
      event.status = body.status;
      if (body.status !== "draft" && !event.publishedAt) event.publishedAt = new Date();
    }
    if (body.visibility) event.visibility = body.visibility;
    if (body.hostType) event.hostType = body.hostType;
    if (body.featured !== undefined) event.featured = body.featured;
    if (body.discordInviteUrl !== undefined) {
      event.discordInviteUrl = body.discordInviteUrl || null;
    }

    await event.save();

    // Soft-fails inside, so a Discord outage never fails the event edit.
    if (event.discordVoiceChannelId && !event.discordVoiceCleanedAt) {
      if (event.title !== previousTitle) {
        await renameEventDiscordVoice(event);
      }
      if ((event.gameSlug || null) !== previousGameSlug) {
        await placeEventDiscordVoice(event);
      }
    }

    const counts = await getRsvpCounts(event._id);

    // --- Lifecycle notifications (fire-and-forget) ---
    const eid = String(event._id);
    if (event.status === "cancelled" && previousStatus !== "cancelled") {
      void notifyEventCancelled({ eventId: eid, eventTitle: event.title });
    }
    if (body.startsAt && new Date(body.startsAt).toISOString() !== previousStartsAt) {
      // Reset reminder flags so the new time gets fresh reminders.
      event.set("remindersSent", { h24: false, h1: false, start: false });
      await event.save();
      void notifyEventTimeChanged({ eventId: eid, eventTitle: event.title });
    }
    if (
      (event.gameSlug || null) !== previousGameSlug &&
      event.status !== "cancelled"
    ) {
      void notifyEventUpdated({ eventId: eid, eventTitle: event.title, change: "game" });
    }

    return NextResponse.json({ success: true, event: serializeEvent(event.toObject(), counts) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Event update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const launcherUser = session?.user?.id ? null : await userFromLauncherBearer(req);
  const currentUserId = session?.user?.id || (launcherUser?._id ? launcherUser._id.toString() : null);
  const isAdmin = session?.user?.role === "admin" || launcherUser?.role === "admin";

  if (!currentUserId && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const event = await PlatformEvent.findById(id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOrganizer = currentUserId && (String(event.organizerId || event.createdBy) === currentUserId);
    if (!isAdmin && !isOrganizer) {
      return NextResponse.json(
        { error: "Forbidden: Only the organizer or admin can delete this event" },
        { status: 403 }
      );
    }

    /*
     * Before the document goes, not after: the channel ids live on it, so a
     * delete-then-clean order would throw away the only record of what to
     * remove and orphan the channel in Discord permanently.
     *
     * Awaited rather than fired off, for the same reason — the request must
     * not return (and the serverless instance freeze) with the call in flight.
     */
    const cleaned = await cleanupEventDiscordVoice(event);
    if (!cleaned) {
      // The event still goes; deleting it must not depend on Discord being up.
      console.error(
        `[events] deleted ${id} but its Discord channels were not removed`,
        {
          voiceChannelId: event.discordVoiceChannelId,
          textChannelId: event.discordTextChannelId,
        }
      );
    }

    // Remove tournament sub-documents before the parent docs go,
    // so we still have the tournament _id to cascade from.
    const tournament = await Tournament.findOne({ eventId: event._id });
    if (tournament) {
      await Promise.all([
        TournamentParticipant.deleteMany({ tournamentId: tournament._id }),
        TournamentTeam.deleteMany({ tournamentId: tournament._id }),
        TournamentMatch.deleteMany({ tournamentId: tournament._id }),
      ]);
      await Tournament.deleteOne({ _id: tournament._id });
    }

    await PlatformEvent.findByIdAndDelete(id);
    await EventRsvp.deleteMany({ eventId: event._id });

    return NextResponse.json({ success: true, message: "Event removed" });
  } catch (err) {
    console.error("Event deletion error:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
