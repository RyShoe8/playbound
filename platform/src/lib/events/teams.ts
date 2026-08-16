import { Types } from "mongoose";
import EventRsvp from "@/lib/models/EventRsvp";
import {
  Tournament,
  TournamentParticipant,
  TournamentTeam,
} from "@/lib/models/Tournament";

function oid(id: string) {
  return new Types.ObjectId(id);
}

export async function userTeam(
  tournamentId: Types.ObjectId,
  userId: string
) {
  return TournamentTeam.findOne({
    tournamentId,
    memberUserIds: oid(userId),
  });
}

export async function createTeam(opts: {
  tournamentId: Types.ObjectId;
  userId: string;
  name: string;
}) {
  const name = opts.name.trim().slice(0, 80);
  if (!name) {
    throw Object.assign(new Error("Team name is required"), { status: 400 });
  }
  const existing = await userTeam(opts.tournamentId, opts.userId);
  if (existing) {
    throw Object.assign(new Error("You are already on a team"), { status: 400 });
  }
  const registered = await TournamentParticipant.findOne({
    tournamentId: opts.tournamentId,
    userId: opts.userId,
  });
  if (!registered) {
    throw Object.assign(new Error("Register for the tournament first"), { status: 400 });
  }
  const team = await TournamentTeam.create({
    tournamentId: opts.tournamentId,
    name,
    captainUserId: oid(opts.userId),
    memberUserIds: [oid(opts.userId)],
  });
  await TournamentParticipant.updateOne(
    { _id: registered._id },
    { $set: { teamId: team._id } }
  );
  return team;
}

export async function joinTeam(opts: {
  tournamentId: Types.ObjectId;
  userId: string;
  teamId: string;
  teamSize: number;
}) {
  if (!Types.ObjectId.isValid(opts.teamId)) {
    throw Object.assign(new Error("Invalid team"), { status: 400 });
  }
  const existing = await userTeam(opts.tournamentId, opts.userId);
  if (existing) {
    throw Object.assign(new Error("You are already on a team"), { status: 400 });
  }
  const registered = await TournamentParticipant.findOne({
    tournamentId: opts.tournamentId,
    userId: opts.userId,
  });
  if (!registered) {
    throw Object.assign(new Error("Register for the tournament first"), { status: 400 });
  }
  const team = await TournamentTeam.findOne({
    _id: opts.teamId,
    tournamentId: opts.tournamentId,
  });
  if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });
  if (team.memberUserIds.length >= opts.teamSize) {
    throw Object.assign(new Error("That team is full"), { status: 400 });
  }
  team.memberUserIds.push(oid(opts.userId));
  await team.save();
  await TournamentParticipant.updateOne(
    { _id: registered._id },
    { $set: { teamId: team._id } }
  );
  return team;
}

export async function leaveTeam(opts: {
  tournamentId: Types.ObjectId;
  userId: string;
}) {
  const team = await userTeam(opts.tournamentId, opts.userId);
  if (!team) throw Object.assign(new Error("You are not on a team"), { status: 400 });
  const uid = String(opts.userId);
  team.memberUserIds = team.memberUserIds.filter((id: unknown) => String(id) !== uid);
  await TournamentParticipant.updateOne(
    { tournamentId: opts.tournamentId, userId: opts.userId },
    { $set: { teamId: null } }
  );
  if (team.memberUserIds.length === 0) {
    await team.deleteOne();
    return { deleted: true };
  }
  if (String(team.captainUserId) === uid) {
    team.captainUserId = team.memberUserIds[0];
  }
  await team.save();
  return { deleted: false };
}

export async function kickFromTournament(opts: {
  tournamentId: Types.ObjectId;
  eventId: Types.ObjectId;
  userId?: string;
  teamId?: string;
}) {
  if (opts.teamId) {
    if (!Types.ObjectId.isValid(opts.teamId)) {
      throw Object.assign(new Error("Invalid team"), { status: 400 });
    }
    const team = await TournamentTeam.findOne({
      _id: opts.teamId,
      tournamentId: opts.tournamentId,
    });
    if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });
    const memberIds = team.memberUserIds.map((id: unknown) => String(id));
    await TournamentTeam.deleteOne({ _id: team._id });
    await TournamentParticipant.deleteMany({
      tournamentId: opts.tournamentId,
      userId: { $in: team.memberUserIds },
    });
    await EventRsvp.updateMany(
      { eventId: opts.eventId, userId: { $in: team.memberUserIds } },
      { $set: { status: "not_going" } }
    );
    return { kicked: memberIds.length };
  }
  if (!opts.userId || !Types.ObjectId.isValid(opts.userId)) {
    throw Object.assign(new Error("userId or teamId required"), { status: 400 });
  }
  await leaveTeam({ tournamentId: opts.tournamentId, userId: opts.userId }).catch(() => null);
  await TournamentParticipant.deleteOne({
    tournamentId: opts.tournamentId,
    userId: opts.userId,
  });
  await EventRsvp.updateOne(
    { eventId: opts.eventId, userId: opts.userId },
    { $set: { status: "not_going" } }
  );
  return { kicked: 1 };
}

export async function removeUserFromTeams(tournamentId: Types.ObjectId, userId: string) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) return;
  await leaveTeam({ tournamentId, userId }).catch(() => null);
}
