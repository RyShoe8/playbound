import { Schema, model, models, type InferSchemaType, type Types } from "mongoose";
import {
  MATCH_STATUSES,
  TOURNAMENT_FORMATS,
  TOURNAMENT_PARTICIPANT_STATES,
} from "@/lib/events/types";

const TournamentSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformEvent",
      required: true,
      unique: true,
    },
    format: {
      type: String,
      enum: TOURNAMENT_FORMATS,
      default: "single_elim",
    },
    teamSize: { type: Number, default: 1, min: 1, max: 16 },
    checkInRequired: { type: Boolean, default: true },
    bracketGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type TournamentDoc = InferSchemaType<typeof TournamentSchema> & {
  _id: Types.ObjectId;
};

export const Tournament =
  models.Tournament || model("Tournament", TournamentSchema);

const TournamentTeamSchema = new Schema(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    name: { type: String, required: true, maxlength: 80 },
    captainUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export type TournamentTeamDoc = InferSchemaType<typeof TournamentTeamSchema> & {
  _id: Types.ObjectId;
};

export const TournamentTeam =
  models.TournamentTeam || model("TournamentTeam", TournamentTeamSchema);

const TournamentParticipantSchema = new Schema(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    teamId: { type: Schema.Types.ObjectId, ref: "TournamentTeam", default: null },
    seed: { type: Number, default: null },
    state: {
      type: String,
      enum: TOURNAMENT_PARTICIPANT_STATES,
      default: "registered",
    },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TournamentParticipantSchema.index(
  { tournamentId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);

export type TournamentParticipantDoc = InferSchemaType<
  typeof TournamentParticipantSchema
> & { _id: Types.ObjectId };

export const TournamentParticipant =
  models.TournamentParticipant ||
  model("TournamentParticipant", TournamentParticipantSchema);

const TournamentMatchSchema = new Schema(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    round: { type: Number, required: true, min: 1 },
    matchNumber: { type: Number, required: true, min: 1 },
    participantAId: {
      type: Schema.Types.ObjectId,
      ref: "TournamentParticipant",
      default: null,
    },
    participantBId: {
      type: Schema.Types.ObjectId,
      ref: "TournamentParticipant",
      default: null,
    },
    scheduledAt: { type: Date, default: null },
    status: {
      type: String,
      enum: MATCH_STATUSES,
      default: "pending",
    },
    scoreA: { type: Number, default: null },
    scoreB: { type: Number, default: null },
    winnerParticipantId: {
      type: Schema.Types.ObjectId,
      ref: "TournamentParticipant",
      default: null,
    },
    nextMatchId: {
      type: Schema.Types.ObjectId,
      ref: "TournamentMatch",
      default: null,
    },
    nextMatchSlot: { type: String, enum: ["A", "B"], default: null },
  },
  { timestamps: true }
);

TournamentMatchSchema.index({ tournamentId: 1, round: 1, matchNumber: 1 }, { unique: true });

export type TournamentMatchDoc = InferSchemaType<typeof TournamentMatchSchema> & {
  _id: Types.ObjectId;
};

export const TournamentMatch =
  models.TournamentMatch || model("TournamentMatch", TournamentMatchSchema);

export default Tournament;
