/**
 * Generate a single-elimination bracket from checked-in / registered participants.
 */
import dbConnect from "@/lib/db";
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
} from "@/lib/models/Tournament";
import { nextPowerOfTwoForTest } from "@/lib/events/bracketHelpers";

function nextPowerOfTwo(n: number): number {
  return nextPowerOfTwoForTest(n);
}

export async function generateSingleElimBracket(tournamentId: string): Promise<{
  matches: number;
}> {
  await dbConnect();
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw Object.assign(new Error("Tournament not found"), { status: 404 });

  const participants = await TournamentParticipant.find({
    tournamentId: tournament._id,
    state: { $in: ["registered", "checked_in", "active"] },
  }).lean();

  if (participants.length < 2) {
    throw Object.assign(new Error("Need at least 2 participants"), { status: 400 });
  }

  await TournamentMatch.deleteMany({ tournamentId: tournament._id });

  // Prefer checked_in; seed randomly otherwise
  const ordered = [...participants].sort((a, b) => {
    const ac = a.state === "checked_in" ? 0 : 1;
    const bc = b.state === "checked_in" ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return Math.random() - 0.5;
  });

  for (let i = 0; i < ordered.length; i++) {
    await TournamentParticipant.updateOne(
      { _id: ordered[i]._id },
      { $set: { seed: i + 1, state: "active" } }
    );
  }

  const size = nextPowerOfTwo(ordered.length);
  const byes = size - ordered.length;
  const slots: (typeof ordered[0] | null)[] = [...ordered];
  for (let i = 0; i < byes; i++) slots.push(null);

  // Round 1 pairings
  const round1Count = size / 2;
  const created: { id: string; round: number; matchNumber: number }[] = [];

  for (let i = 0; i < round1Count; i++) {
    const a = slots[i * 2] || null;
    const b = slots[i * 2 + 1] || null;
    let winnerId = null;
    let status: "pending" | "completed" = "pending";
    if (a && !b) {
      winnerId = a._id;
      status = "completed";
    } else if (b && !a) {
      winnerId = b._id;
      status = "completed";
    }
    const match = await TournamentMatch.create({
      tournamentId: tournament._id,
      round: 1,
      matchNumber: i + 1,
      participantAId: a?._id || null,
      participantBId: b?._id || null,
      status,
      winnerParticipantId: winnerId,
    });
    created.push({ id: String(match._id), round: 1, matchNumber: i + 1 });
  }

  // Subsequent rounds (empty shells)
  let prevRoundMatches = round1Count;
  let round = 2;
  while (prevRoundMatches > 1) {
    const count = prevRoundMatches / 2;
    for (let i = 0; i < count; i++) {
      const match = await TournamentMatch.create({
        tournamentId: tournament._id,
        round,
        matchNumber: i + 1,
        status: "pending",
      });
      created.push({ id: String(match._id), round, matchNumber: i + 1 });
    }
    prevRoundMatches = count;
    round++;
  }

  // Wire nextMatch pointers for round 1 → 2, etc.
  const all = await TournamentMatch.find({ tournamentId: tournament._id }).lean();
  const byRound = new Map<number, typeof all>();
  for (const m of all) {
    const list = byRound.get(m.round) || [];
    list.push(m);
    byRound.set(m.round, list);
  }
  for (const [r, matches] of byRound) {
    const next = byRound.get(r + 1);
    if (!next) continue;
    for (const m of matches) {
      const nextMatch = next[Math.floor((m.matchNumber - 1) / 2)];
      if (!nextMatch) continue;
      const slot = (m.matchNumber - 1) % 2 === 0 ? "A" : "B";
      await TournamentMatch.updateOne(
        { _id: m._id },
        { $set: { nextMatchId: nextMatch._id, nextMatchSlot: slot } }
      );
      // Auto-advance byes
      if (m.status === "completed" && m.winnerParticipantId) {
        const set =
          slot === "A"
            ? { participantAId: m.winnerParticipantId }
            : { participantBId: m.winnerParticipantId };
        await TournamentMatch.updateOne({ _id: nextMatch._id }, { $set: set });
      }
    }
  }

  tournament.bracketGeneratedAt = new Date();
  await tournament.save();
  return { matches: created.length };
}

export async function completeMatch(opts: {
  matchId: string;
  winnerParticipantId: string;
  scoreA?: number | null;
  scoreB?: number | null;
}): Promise<void> {
  await dbConnect();
  const match = await TournamentMatch.findById(opts.matchId);
  if (!match) throw Object.assign(new Error("Match not found"), { status: 404 });

  const winner = String(opts.winnerParticipantId);
  const a = match.participantAId ? String(match.participantAId) : null;
  const b = match.participantBId ? String(match.participantBId) : null;
  if (winner !== a && winner !== b) {
    throw Object.assign(new Error("Winner must be a match participant"), {
      status: 400,
    });
  }

  match.status = "completed";
  match.winnerParticipantId = opts.winnerParticipantId as unknown as typeof match.winnerParticipantId;
  if (opts.scoreA !== undefined) match.scoreA = opts.scoreA;
  if (opts.scoreB !== undefined) match.scoreB = opts.scoreB;
  await match.save();

  const loserId = winner === a ? b : a;
  if (loserId) {
    await TournamentParticipant.updateOne(
      { _id: loserId },
      { $set: { state: "eliminated" } }
    );
  }

  if (match.nextMatchId) {
    const set =
      match.nextMatchSlot === "B"
        ? { participantBId: match.winnerParticipantId }
        : { participantAId: match.winnerParticipantId };
    await TournamentMatch.updateOne({ _id: match.nextMatchId }, { $set: set });
  } else {
    // Final
    await TournamentParticipant.updateOne(
      { _id: match.winnerParticipantId },
      { $set: { state: "winner" } }
    );
  }
}
