import crypto from "node:crypto";
import dbConnect from "@/lib/db";
import MultiplayerSession from "@/lib/models/MultiplayerSession";
import { MixtapeTrack, MixtapeProfile, MixtapeMatch, MixtapeSettings } from "@/lib/models/Mixtape";
import { starterPack, validateDeck, confirmedWinner, catalogComplete, deckSize } from "./rules";

export async function catalog() {
  await dbConnect();
  const [tracks, config] = await Promise.all([MixtapeTrack.find({ enabled: true, audioUrl: { $nin: ["", null] } }).sort({ title: 1 }).lean(), MixtapeSettings.findOne({ key: "hyperdisc-arena" }).lean()]);
  return { tracks: tracks.map(t => ({ ...t, id: String(t.tapeId), _id: undefined })), menuTapeId: config?.menuTapeId || "" };
}
export async function player(userId: string) {
  const { tracks } = await catalog();
  let profile = await MixtapeProfile.findOne({ userId }).lean();
  const tapes = tracks.map(t => ({ id: t.id, starter: Boolean(t.starter), enabled: true }));
  if (!catalogComplete(tapes)) {
    // Testing: until the launch catalog (5 base + 15 others) exists, every
    // player owns every available tape and decks shrink to what exists. Once
    // the catalog is complete, new players get the normal starter pack; tester
    // accounts can be reset from the admin screen to start over.
    const all = tracks.map(t => t.id);
    const owned = new Set<string>((profile?.inventory as string[]) || []);
    const added = all.filter(id => !owned.has(id));
    if (!profile || added.length) {
      profile = await MixtapeProfile.findOneAndUpdate({ userId }, {
        $setOnInsert: { userId, deck: [] },
        $addToSet: { inventory: { $each: all } },
        $push: { acquisitions: { $each: added.map(trackId => ({ trackId, source: "test_grant", at: new Date() })) } },
      }, { upsert: true, returnDocument: "after" }).lean();
    }
    const active = new Set(all);
    const deck = ((profile!.deck as string[]) || []).filter(id => active.has(id));
    const size = deckSize(all.length);
    if (all.length && deck.length !== size) {
      const fill = all.filter(id => !deck.includes(id)).slice(0, Math.max(0, size - deck.length));
      const next = [...deck, ...fill].slice(0, size);
      await MixtapeProfile.updateOne({ userId }, { $set: { deck: next } });
      profile = { ...profile!, deck: next };
    }
    return { inventory: profile!.inventory as string[], deck: profile!.deck as string[], tracks };
  }
  if (!profile) {
    const ids = starterPack(tapes);
    profile = await MixtapeProfile.findOneAndUpdate({ userId }, { $setOnInsert: { userId, inventory: ids, deck: ids.slice(0, 6), acquisitions: ids.map(trackId => ({ trackId, source: "starter_pack", at: new Date() })) } }, { upsert: true, returnDocument: "after" }).lean();
  }
  return { inventory: profile!.inventory as string[], deck: profile!.deck as string[], tracks };
}
export async function saveDeck(userId: string, ids: unknown) {
  const p = await player(userId);
  const deck = validateDeck(ids, p.inventory, p.tracks.map(t => t.id));
  await MixtapeProfile.updateOne({ userId }, { $set: { deck } });
  return { deck };
}
export async function registerMatch(userId: string, body: Record<string, unknown>) {
  const sessionId = String(body.sessionId || ""), matchId = String(body.matchId || ""), role = body.role;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(matchId) || !["host", "client"].includes(String(role))) throw new Error("Invalid match");
  const session = await MultiplayerSession.findOne({ sessionId, gameSlug: "hyperdisc-arena", expiresAt: { $gt: new Date() }, status: { $ne: "ended" } }).select("+hostTokenHash +clientTokenHashes").lean();
  const hash = crypto.createHash("sha256").update(String(body.sessionToken || "")).digest("hex");
  const hashes = role === "host" ? [session?.hostTokenHash] : session?.clientTokenHashes || [];
  if (!session || !hashes.includes(hash)) throw new Error("Room membership required");
  const p = await player(userId);
  validateDeck(p.deck, p.inventory, p.tracks.map(t => t.id));
  await MixtapeMatch.updateOne({ matchId }, { $setOnInsert: { matchId, sessionId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }, { upsert: true });
  const existing = await MixtapeMatch.findOne({ matchId, sessionId }).lean();
  if (existing?.[String(role)] === userId) return { matchId, decks: existing.decks, players: { host: existing.host, client: existing.client } };
  const other = role === "host" ? "client" : "host";
  const m = await MixtapeMatch.findOneAndUpdate({ matchId, sessionId, [other]: { $ne: userId }, [String(role)]: "", [`reports.${userId}`]: { $exists: false } }, { $set: { [String(role)]: userId, [`decks.${userId}`]: p.deck } }, { returnDocument: "after" }).lean();
  if (!m) throw new Error("Match seat already occupied");
  return { matchId, decks: m.decks, players: { host: m.host, client: m.client } };
}
export async function matchState(userId: string, matchId: string) {
  const m = await MixtapeMatch.findOne({ matchId, $or: [{ host: userId }, { client: userId }], expiresAt: { $gt: new Date() } }).lean();
  if (!m) throw new Error("Match not found");
  const winner = confirmedWinner(m.reports, [m.host, m.client]);
  return { matchId, decks: m.decks, players: { host: m.host, client: m.client }, winner, dubTrack: m.dubTrack };
}
export async function reportMatch(userId: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ""), winner = String(body.winner || ""), checksum = String(body.checksum || "");
  const m = await matchState(userId, matchId);
  if (![m.players.host, m.players.client].includes(winner) || !/^-?\d{1,20}$/.test(checksum)) throw new Error("Invalid result");
  // A submitted result is immutable. Conflicting retries cannot rewrite history.
  await MixtapeMatch.updateOne({ matchId, [`reports.${userId}`]: { $exists: false } }, { $set: { [`reports.${userId}`]: { winner, checksum } } });
  return matchState(userId, matchId);
}
export async function dub(userId: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ""), trackId = String(body.trackId || "");
  const m = await matchState(userId, matchId);
  if (m.winner !== userId) throw new Error("Both players must confirm your victory before dubbing");
  const loser = m.players.host === userId ? m.players.client : m.players.host;
  if (!m.decks[loser]?.includes(trackId) || !(await MixtapeTrack.exists({ tapeId: trackId, enabled: true }))) throw new Error("Tape was not in the opponent's match deck");
  const p = await MixtapeProfile.findOne({ userId }).lean();
  if (!p || (p.inventory.includes(trackId) && m.dubTrack !== trackId)) throw new Error("Tape already in collection");
  const claimed = await MixtapeMatch.findOneAndUpdate({ matchId, $or: [{ dubTrack: "" }, { dubTrack: trackId }] }, { $set: { dubTrack: trackId } }, { returnDocument: "after" });
  if (!claimed) throw new Error("This match's tape has already been dubbed");
  await MixtapeProfile.updateOne({ userId, inventory: { $ne: trackId } }, { $addToSet: { inventory: trackId }, $push: { acquisitions: { trackId, source: "dubbed_match", matchId, at: new Date() } } });
  return { trackId, inventory: (await MixtapeProfile.findOne({ userId }).lean())!.inventory };
}
