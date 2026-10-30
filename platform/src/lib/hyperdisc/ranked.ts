import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { HyperdiscRating, HyperdiscQueueTicket } from "@/lib/models/HyperdiscRanked";
import { MixtapeMatch } from "@/lib/models/Mixtape";
import { confirmedWinner } from "@/lib/mixtape/rules";

/** HyperDisc Arena ranked play: Elo ratings from confirmed matches, and quick-match pairing. */

export const START_RATING = 1000;
export const K_FACTOR = 32;
/** A waiting ticket that stops polling is dropped after this long. */
export const TICKET_TTL_MS = 30_000;

/** Chance that a player rated `a` beats one rated `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** Rating changes for a win: [winner's gain, loser's loss], whole points, at least 1. */
export function eloChange(winner: number, loser: number, k = K_FACTOR): [number, number] {
  const gain = Math.max(1, Math.round(k * (1 - expectedScore(winner, loser))));
  return [gain, -gain];
}

async function nameOf(userId: string): Promise<string> {
  const user = await User.findById(userId).select("username").lean<{ username?: string }>().catch(() => null);
  return String(user?.username || "Player").slice(0, 32);
}

async function ratingOf(userId: string): Promise<number> {
  const row = await HyperdiscRating.findOne({ userId }).select("rating").lean<{ rating?: number }>();
  return Number(row?.rating ?? START_RATING);
}

/**
 * Applies a match's result to both ratings once, after both players reported the same winner.
 * Idempotent: the match is claimed (rated = true) before any rating moves.
 */
export async function rateMatch(matchId: string): Promise<Record<string, number> | null> {
  await dbConnect();
  const m = await MixtapeMatch.findOne({ matchId }).lean<{ host: string; client: string; reports: Record<string, { winner: string; checksum: string }>; rated?: boolean; ratingChange?: Record<string, number> }>();
  if (!m) return null;
  if (m.rated) return m.ratingChange || null;
  const winner = confirmedWinner(m.reports || {}, [m.host, m.client]);
  if (!winner) return null;
  const loser = winner === m.host ? m.client : m.host;
  const claimed = await MixtapeMatch.findOneAndUpdate({ matchId, rated: { $ne: true } }, { $set: { rated: true } });
  if (!claimed) return (await MixtapeMatch.findOne({ matchId }).lean<{ ratingChange?: Record<string, number> }>())?.ratingChange || null;
  // Make sure both players have a row (new players start at START_RATING), then move them.
  for (const userId of [winner, loser]) {
    await HyperdiscRating.updateOne({ userId }, { $setOnInsert: { userId, rating: START_RATING, wins: 0, losses: 0 }, $set: { name: await nameOf(userId) } }, { upsert: true });
  }
  const [gain, loss] = eloChange(await ratingOf(winner), await ratingOf(loser));
  await HyperdiscRating.updateOne({ userId: winner }, { $inc: { rating: gain, wins: 1 } });
  await HyperdiscRating.updateOne({ userId: loser }, { $inc: { rating: loss, losses: 1 } });
  const ratingChange = { [winner]: gain, [loser]: loss };
  await MixtapeMatch.updateOne({ matchId }, { $set: { ratingChange } });
  return ratingChange;
}

export type LeaderboardRow = { rank: number; userId: string; name: string; rating: number; wins: number; losses: number };

/** The top players and, if ranked, where the viewer stands. */
export async function leaderboard(viewerId: string, limit = 50): Promise<{ top: LeaderboardRow[]; me: LeaderboardRow | null }> {
  await dbConnect();
  const rows = await HyperdiscRating.find({}).sort({ rating: -1, updatedAt: 1 }).limit(limit).lean<Array<{ userId: string; name: string; rating: number; wins: number; losses: number }>>();
  const top = rows.map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, rating: r.rating, wins: r.wins, losses: r.losses }));
  const mine = await HyperdiscRating.findOne({ userId: viewerId }).lean<{ userId: string; name: string; rating: number; wins: number; losses: number }>();
  const me = mine ? { rank: (await HyperdiscRating.countDocuments({ rating: { $gt: mine.rating } })) + 1, userId: mine.userId, name: mine.name, rating: mine.rating, wins: mine.wins, losses: mine.losses } : null;
  return { top, me };
}

/**
 * Quick match. Joins the waiting player closest in rating (same game version) if there is one:
 * returns their room code. Otherwise queues the caller, who then opens a private room and sends
 * its code with setRoom.
 */
export async function queue(userId: string, version: string): Promise<{ joinCode: string } | { host: true }> {
  await dbConnect();
  await HyperdiscQueueTicket.deleteOne({ userId });
  const rating = await ratingOf(userId);
  const candidates = await HyperdiscQueueTicket.find({ status: "waiting", version, joinCode: { $ne: "" }, userId: { $ne: userId }, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: 1 }).limit(25).lean<Array<{ _id: unknown; rating: number; joinCode: string }>>();
  candidates.sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
  for (const c of candidates) {
    const claimed = await HyperdiscQueueTicket.findOneAndUpdate({ _id: c._id, status: "waiting" }, { $set: { status: "matched", matchedWith: userId } });
    if (claimed) return { joinCode: c.joinCode };
  }
  await HyperdiscQueueTicket.create({ userId, name: await nameOf(userId), rating, version, expiresAt: new Date(Date.now() + TICKET_TTL_MS) });
  return { host: true };
}

/** The queued player's private room is open: others can now be matched into it. */
export async function setRoom(userId: string, joinCode: string): Promise<boolean> {
  if (!/^[A-Z0-9-]{4,16}$/i.test(joinCode)) return false;
  await dbConnect();
  const res = await HyperdiscQueueTicket.updateOne({ userId, status: "waiting" }, { $set: { joinCode: joinCode.toUpperCase(), expiresAt: new Date(Date.now() + TICKET_TTL_MS) } });
  return res.modifiedCount > 0 || res.matchedCount > 0;
}

/** Keeps a waiting ticket alive; says whether someone has been matched in. */
export async function poll(userId: string): Promise<{ status: "waiting" | "matched" | "gone" }> {
  await dbConnect();
  const t = await HyperdiscQueueTicket.findOneAndUpdate({ userId }, { $set: { expiresAt: new Date(Date.now() + TICKET_TTL_MS) } }, { returnDocument: "after" }).lean<{ status: "waiting" | "matched" }>();
  return { status: t ? t.status : "gone" };
}

export async function cancel(userId: string): Promise<void> {
  await dbConnect();
  await HyperdiscQueueTicket.deleteOne({ userId });
}
