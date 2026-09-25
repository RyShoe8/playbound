import { Types } from "mongoose";
import SavedWorld from "@/lib/models/SavedWorld";

import { supportsSavedWorlds, type SavedWorldSummary } from "@/lib/savedWorldGames";

export { supportsSavedWorlds, type SavedWorldSummary };

/** Worlds this user has played on for a game, most recent first. */
export async function listSavedWorlds(userId: string, gameSlug: string): Promise<SavedWorldSummary[]> {
  if (!supportsSavedWorlds(gameSlug) || !Types.ObjectId.isValid(userId)) return [];
  const rows = await SavedWorld.find({ gameSlug, memberIds: new Types.ObjectId(userId) })
    .sort({ lastPlayedAt: -1, createdAt: -1 })
    .limit(50)
    .select({ name: 1, lastPlayedAt: 1 })
    .lean();
  return rows.map((w) => ({
    id: String(w._id),
    name: w.name,
    lastPlayedAt: w.lastPlayedAt ? new Date(w.lastPlayedAt).toISOString() : null,
  }));
}

/** True when the user may load this world for this game. */
export async function canUseSavedWorld(userId: string, worldId: string, gameSlug: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(worldId) || !Types.ObjectId.isValid(userId)) return false;
  return Boolean(
    await SavedWorld.exists({ _id: worldId, gameSlug, memberIds: new Types.ObjectId(userId) })
  );
}

/**
 * The world a hosted room should run, creating one on the party's first
 * start. Every current party member becomes a member of the world, so any of
 * them can load it next time.
 */
export async function resolvePartyWorld(party: {
  _id: unknown;
  gameSlug?: string | null;
  name?: string | null;
  leaderId?: unknown;
  savedWorldId?: unknown;
  members?: Array<{ userId: unknown }>;
}): Promise<string | null> {
  const gameSlug = String(party.gameSlug || "");
  if (!supportsSavedWorlds(gameSlug) || !party.leaderId) return null;
  const memberIds = (party.members || []).map((m) => new Types.ObjectId(String(m.userId)));
  const now = new Date();
  const worldId = party.savedWorldId ? String(party.savedWorldId) : "";
  if (Types.ObjectId.isValid(worldId)) {
    const updated = await SavedWorld.findOneAndUpdate(
      { _id: new Types.ObjectId(worldId), gameSlug },
      { $addToSet: { memberIds: { $each: memberIds } }, $set: { lastPlayedAt: now } },
      { new: true }
    ).select({ _id: 1 }).lean();
    if (updated) return String(updated._id);
  }
  const created = await SavedWorld.create({
    gameSlug,
    name: (typeof party.name === "string" && party.name.trim()) || "Morrowind world",
    createdBy: new Types.ObjectId(String(party.leaderId)),
    memberIds,
    lastPlayedAt: now,
  });
  return String(created._id);
}
