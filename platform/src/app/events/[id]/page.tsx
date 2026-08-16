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
import { EventRsvpActions } from "@/components/events/EventRsvpActions";
import { EventFriendsAttending } from "@/components/events/EventFriendsAttending";
import { EventActionBar } from "@/components/events/EventActionBar";
import { EventViewTracker } from "@/components/events/EventViewTracker";
import { TournamentBracket } from "@/components/events/TournamentBracket";
import { TournamentCheckInButton } from "@/components/events/TournamentCheckInButton";
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
} from "@/lib/models/Tournament";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return { title: "Event" };
  await dbConnect();
  const event = await PlatformEvent.findById(id).select({ title: 1 }).lean();
  return pageMetadata({
    title: event?.title || "Event",
    description: "PlayBound community event",
    path: `/events/${id}`,
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

  const event = serializeEvent(eventDoc, counts);
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

  let tournamentPayload: {
    format: string;
    participants: { id: string; userId: string | null; state: string; seed: number | null }[];
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
      const [participants, matches] = await Promise.all([
        TournamentParticipant.find({ tournamentId: t._id }).lean(),
        TournamentMatch.find({ tournamentId: t._id })
          .sort({ round: 1, matchNumber: 1 })
          .lean(),
      ]);
      tournamentPayload = {
        format: t.format,
        participants: participants.map((p) => ({
          id: String(p._id),
          userId: p.userId ? String(p.userId) : null,
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

  const isLive = event.status === "live";
  const rsvpOpen = canRsvp(event.status);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <EventViewTracker
        eventId={event.id}
        eventType={String(event.eventType)}
        gameSlug={event.gameSlug}
      />

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
          <span>
            {event.when.dateLine}
            <br />
            {event.when.rangeLine}
          </span>
        </p>
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

      <EventActionBar
        eventId={event.id}
        gameSlug={event.gameSlug}
        discordInviteUrl={event.discordInviteUrl}
        isLive={isLive}
        game={game}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          Join the fun
        </h2>
        <EventRsvpActions
          eventId={event.id}
          gameSlug={event.gameSlug}
          initialStatus={myRsvp}
          disabled={!rsvpOpen}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          About
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </p>
      </section>

      <EventFriendsAttending eventId={event.id} />

      {tournamentPayload ? (
        <>
          <TournamentCheckInButton eventId={event.id} />
          <TournamentBracket
            format={tournamentPayload.format}
            participants={tournamentPayload.participants}
            matches={tournamentPayload.matches}
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
