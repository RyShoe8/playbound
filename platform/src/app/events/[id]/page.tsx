import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Types } from "mongoose";
import { CalendarDays, Users } from "lucide-react";
import dbConnect from "@/lib/db";
import PlatformEvent from "@/lib/models/PlatformEvent";
import EventRsvp from "@/lib/models/EventRsvp";
import User from "@/lib/models/User";
import { getGame } from "@/lib/catalog";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getRsvpCounts } from "@/lib/events/rsvpCounts";
import { serializeEvent } from "@/lib/events/serialize";
import { getEventPresenceAggregates } from "@/lib/events/presenceAgg";
import { canRsvp } from "@/lib/events/types";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { EventRsvpActions } from "@/components/events/EventRsvpActions";
import { EventFriendsAttending } from "@/components/events/EventFriendsAttending";
import { EventActionBar } from "@/components/events/EventActionBar";
import { EventManageActions } from "@/components/events/EventManageActions";
import { EventViewTracker } from "@/components/events/EventViewTracker";
import { TournamentBracket } from "@/components/events/TournamentBracket";
import { TournamentCheckInButton } from "@/components/events/TournamentCheckInButton";
import { EventRoster } from "@/components/events/EventRoster";
import { EventLocalWhen } from "@/components/LocalTime";
import { teamSizeLabel } from "@/lib/events/types";
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentTeam,
} from "@/lib/models/Tournament";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return { title: "Event" };
  await dbConnect();
  const event = await PlatformEvent.findById(id)
    .select({ title: 1, description: 1, startsAt: 1, visibility: 1, gameSlug: 1 })
    .lean();

  const when = event?.startsAt
    ? new Date(event.startsAt).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  return pageMetadata({
    title: event?.title || "Event",
    description:
      event?.description?.trim() ||
      `A PlayBound community event${when ? ` on ${when}` : ""}. See who is going and RSVP.`,
    path: `/events/${id}`,
    /*
     * Unlisted means reachable by link, not listed publicly — so it should not
     * turn up in search either. Without this the only thing keeping an unlisted
     * event out of results was nobody linking to it.
     */
    noIndex: event?.visibility === "unlisted",
  });
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await dbConnect();
  const eventDoc = await PlatformEvent.findById(id).lean();
  if (!eventDoc) notFound();

  const [counts, presence, game, session] = await Promise.all([
    getRsvpCounts(eventDoc._id),
    getEventPresenceAggregates({
      eventId: eventDoc._id,
      gameSlug: eventDoc.gameSlug,
    }),
    eventDoc.gameSlug ? getGame(eventDoc.gameSlug) : Promise.resolve(null),
    getServerSession(authOptions),
  ]);

  const event = serializeEvent(eventDoc, counts, game?.coverImage || null);
  let myRsvp: string | null = null;
  if (session?.user?.id) {
    const r = await EventRsvp.findOne({
      eventId: eventDoc._id,
      userId: session.user.id,
    }).lean();
    myRsvp = r?.status || null;
  }

  let organizerName: string | null = null;
  const orgId = eventDoc.organizerId || eventDoc.createdBy;
  if (orgId) {
    const u = await User.findById(orgId).select({ username: 1 }).lean();
    organizerName = u?.username || null;
  }

  const goingRsvps = await EventRsvp.find({
    eventId: eventDoc._id,
    status: "going",
  })
    .select({ userId: 1 })
    .lean();
  const goingIds = goingRsvps.map((r) => r.userId);
  const goingUsers = goingIds.length
    ? await User.find({ _id: { $in: goingIds } }).select({ username: 1 }).lean()
    : [];
  const nameById = new Map(
    goingUsers.map((u) => [String(u._id), u.username || "Player"])
  );
  const registeredPeople = goingRsvps.map((r) => ({
    userId: String(r.userId),
    username: nameById.get(String(r.userId)) || "Player",
  }));

  let tournamentPayload: {
    format: string;
    teamSize: number;
    teams: {
      id: string;
      name: string;
      captainUserId: string;
      members: { userId: string; username: string }[];
    }[];
    participants: {
      id: string;
      userId: string | null;
      teamId: string | null;
      label: string;
      state: string;
      seed: number | null;
    }[];
    matches: {
      id: string;
      round: number;
      matchNumber: number;
      participantAId: string | null;
      participantBId: string | null;
      status: string;
      winnerParticipantId: string | null;
      scoreA: number | null;
      scoreB: number | null;
    }[];
  } | null = null;

  if (event.eventType === "tournament") {
    const t = await Tournament.findOne({ eventId: eventDoc._id }).lean();
    if (t) {
      const [participants, matches, teams] = await Promise.all([
        TournamentParticipant.find({ tournamentId: t._id }).lean(),
        TournamentMatch.find({ tournamentId: t._id })
          .sort({ round: 1, matchNumber: 1 })
          .lean(),
        TournamentTeam.find({ tournamentId: t._id }).lean(),
      ]);
      const teamMap = new Map(teams.map((tm) => [String(tm._id), tm]));
      tournamentPayload = {
        format: t.format,
        teamSize: t.teamSize || 1,
        teams: teams.map((tm) => ({
          id: String(tm._id),
          name: tm.name,
          captainUserId: String(tm.captainUserId),
          members: (tm.memberUserIds || []).map((id: unknown) => ({
            userId: String(id),
            username: nameById.get(String(id)) || "Player",
          })),
        })),
        participants: participants.map((p) => ({
          id: String(p._id),
          userId: p.userId ? String(p.userId) : null,
          teamId: p.teamId ? String(p.teamId) : null,
          label: p.label || (p.userId ? nameById.get(String(p.userId)) : null) || (p.teamId ? teamMap.get(String(p.teamId))?.name : null) || "Participant",
          state: p.state,
          seed: p.seed,
        })),
        matches: matches.map((m) => ({
          id: String(m._id),
          round: m.round,
          matchNumber: m.matchNumber,
          participantAId: m.participantAId ? String(m.participantAId) : null,
          participantBId: m.participantBId ? String(m.participantBId) : null,
          status: m.status,
          winnerParticipantId: m.winnerParticipantId
            ? String(m.winnerParticipantId)
            : null,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
        })),
      };
    }
  }

  const isAdmin = session?.user?.role === "admin";

  const isLive = event.status === "live";
  const rsvpOpen = canRsvp(event.status);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {/*
        Event markup, so a listing can carry its date in the result rather than
        looking like any other page. Only for public events — an unlisted one is
        noindexed above, and describing it here would work against that.
      */}
      {event.visibility !== "unlisted" && (
        <JsonLd
          data={graph(
            {
              "@type": "Event",
              "@id": absoluteUrl(`/events/${event.id}`) + "#event",
              name: event.title,
              url: absoluteUrl(`/events/${event.id}`),
              startDate: event.startsAt,
              endDate: event.endsAt,
              ...(event.description ? { description: event.description } : {}),
              /*
               * Online, always. PlayBound events happen in a game, so the
               * "location" is the game itself rather than a place — Google
               * treats a missing location as an error on an Event.
               */
              eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
              eventStatus:
                event.status === "cancelled"
                  ? "https://schema.org/EventCancelled"
                  : "https://schema.org/EventScheduled",
              location: {
                "@type": "VirtualLocation",
                url: absoluteUrl(
                  event.gameSlug ? `/games/${event.gameSlug}` : `/events/${event.id}`
                ),
              },
              organizer: { "@id": ORGANIZATION_ID },
              isAccessibleForFree: true,
            },
            breadcrumbSchema([
              { name: "Events", path: "/events" },
              { name: event.title, path: `/events/${event.id}` },
            ])
          )}
        />
      )}
      <EventViewTracker
        eventId={event.id}
        eventType={String(event.eventType)}
        gameSlug={event.gameSlug}
      />

      {event.coverImage ? (
        <div className="relative h-48 sm:h-64 w-full overflow-hidden rounded-2xl border border-border/80 bg-card/60 shadow-lg shadow-black/20">
          <img
            src={event.coverImage}
            alt={event.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {isLive ? (
            <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-red-400">Live now</span>
          ) : null}
          <span>
            {event.eventType === "tournament"
              ? "Tournament"
              : event.eventType === "party"
                ? "Party"
                : "Game Night"}
          </span>
          {event.hostType === "playbound" ? (
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-primary">
              PlayBound hosted
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {event.title}
        </h1>
        {game ? (
          <p className="text-lg font-semibold">
            <Link href={`/games/${game.slug}`} className="text-primary hover:underline">
              {game.title}
            </Link>
            {event.editionSlug ? (
              <span className="text-muted-foreground"> · {event.editionSlug}</span>
            ) : null}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          <EventLocalWhen startsAt={event.startsAt} endsAt={event.endsAt} />
        </p>
        {tournamentPayload ? (
          <p className="text-sm font-semibold text-muted-foreground">
            {teamSizeLabel(tournamentPayload.teamSize)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4" /> {counts.going} going
          {event.maxParticipants ? ` / ${event.maxParticipants}` : ""}
        </span>
        <span className="text-emerald-400">{presence.online} online</span>
        <span className="text-violet-400">{presence.playing} playing</span>
        {counts.maybe > 0 ? (
          <span className="text-muted-foreground">{counts.maybe} maybe</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <EventActionBar
          eventId={event.id}
          gameSlug={event.gameSlug}
          discordInviteUrl={event.discordInviteUrl}
          isLive={isLive}
          game={game}
        />
        {(isAdmin || (session?.user?.id && orgId && String(orgId) === session.user.id)) ? (
          <EventManageActions
            eventId={event.id}
            isCancelled={event.status === "cancelled"}
          />
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          {event.eventType === "tournament" ? "Register" : "Join the fun"}
        </h2>
        <EventRsvpActions
          eventId={event.id}
          gameSlug={event.gameSlug}
          initialStatus={myRsvp}
          disabled={!rsvpOpen}
          mode={event.eventType === "tournament" ? "register" : "rsvp"}
        />
      </section>

      <EventRoster
        eventId={event.id}
        eventType={event.eventType}
        people={registeredPeople}
        teams={tournamentPayload?.teams || []}
        teamSize={tournamentPayload?.teamSize || 1}
        isAdmin={isAdmin}
        registered={myRsvp === "going"}
      />

      {event.description.trim() ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            About
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {event.description}
          </p>
        </section>
      ) : null}

      <EventFriendsAttending eventId={event.id} />

      {tournamentPayload ? (
        <>
          <TournamentCheckInButton eventId={event.id} />
          <TournamentBracket
            eventId={event.id}
            format={tournamentPayload.format}
            teamSize={tournamentPayload.teamSize}
            participants={tournamentPayload.participants}
            matches={tournamentPayload.matches}
            isAdmin={isAdmin}
          />
        </>
      ) : null}

      {(event.recommendedModSlugs?.length || event.modSlugs?.length) ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Mods
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {[...(event.modSlugs || []), ...(event.recommendedModSlugs || [])]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((slug) => (
                <li key={slug}>
                  <Link href={`/mods/${slug}`} className="text-primary hover:underline">
                    {slug}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {organizerName ? (
        <p className="text-xs text-muted-foreground">
          Organized by{" "}
          <Link
            href={`/users/${encodeURIComponent(organizerName)}`}
            className="font-semibold text-foreground hover:underline"
          >
            {organizerName}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
