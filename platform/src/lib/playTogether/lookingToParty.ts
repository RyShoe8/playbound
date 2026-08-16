import dbConnect from "@/lib/db";
import Presence from "@/lib/models/Presence";
import LibraryEntry from "@/lib/models/LibraryEntry";
import User from "@/lib/models/User";
import { listGames } from "@/lib/catalog";

/**
 * "Looking to party" — people who have raised their hand for a game right now.
 *
 * The flag lives on Presence with an hour's TTL, so the live set is simply
 * "unexpired", and privacy is honoured the same way the friends surfaces do it:
 * anyone appearing offline or hiding their activity is left out entirely rather
 * than listed without detail.
 */

export type LookingToPartyEntry = {
  id: string;
  username: string;
  /** Games they said they want to play. May be empty — "anything". */
  wantsToPlay: { slug: string; title: string }[];
  /** Games they actually have installed, so you can see what is realistic. */
  installedGames: { slug: string; title: string }[];
  /** What they are in right now, if anything. */
  currentGame: { slug: string; title: string } | null;
  expiresAt: string | null;
};

/** Users whose looking-to-party flag has not expired and who are visible. */
async function visibleLookingPresences() {
  await dbConnect();
  const presences = await Presence.find({
    lookingForPlayersUntil: { $gt: new Date() },
  })
    .select(
      "userId lookingForPlayersUntil lookingForPlayersGameId lookingForPlayersGameIds currentGameId"
    )
    .lean();

  if (presences.length === 0) return { presences: [], users: [] };

  const userIds = presences.map((p) => String(p.userId));
  const users = await User.find({ _id: { $in: userIds }, disabled: { $ne: true } })
    .select("username preferences")
    .lean();

  const visible = users.filter((u) => {
    const prefs = (u as { preferences?: { appearOffline?: boolean; hideActivityFromFriends?: boolean } })
      .preferences;
    return !prefs?.appearOffline && !prefs?.hideActivityFromFriends;
  });

  const visibleIds = new Set(visible.map((u) => String(u._id)));
  return {
    presences: presences.filter((p) => visibleIds.has(String(p.userId))),
    users: visible,
  };
}

export async function countLookingToParty(): Promise<number> {
  try {
    const { presences } = await visibleLookingPresences();
    return presences.length;
  } catch (err) {
    console.error("countLookingToParty failed:", err);
    return 0;
  }
}

export async function listLookingToParty(limit = 100): Promise<LookingToPartyEntry[]> {
  const { presences, users } = await visibleLookingPresences();
  if (presences.length === 0) return [];

  const capped = presences.slice(0, limit);
  const userIds = capped.map((p) => String(p.userId));

  const [library, games] = await Promise.all([
    LibraryEntry.find({ userId: { $in: userIds }, installed: true })
      .select("userId gameSlug")
      .lean(),
    listGames({ includeTesting: true }),
  ]);

  const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));
  const named = (slug: string) => ({ slug, title: titleBySlug.get(slug) || slug });

  const installedByUser = new Map<string, string[]>();
  for (const row of library) {
    const key = String(row.userId);
    if (!installedByUser.has(key)) installedByUser.set(key, []);
    installedByUser.get(key)!.push(String(row.gameSlug));
  }

  const userById = new Map(users.map((u) => [String(u._id), u]));

  return capped
    .map((p) => {
      const id = String(p.userId);
      const user = userById.get(id);
      if (!user) return null;

      // Older presence rows only ever set the singular field.
      const wanted: string[] =
        Array.isArray(p.lookingForPlayersGameIds) && p.lookingForPlayersGameIds.length > 0
          ? (p.lookingForPlayersGameIds as string[])
          : p.lookingForPlayersGameId
          ? [String(p.lookingForPlayersGameId)]
          : [];

      return {
        id,
        username: String(user.username || "player"),
        wantsToPlay: wanted.map((slug) => named(String(slug))),
        installedGames: (installedByUser.get(id) || []).map(named),
        currentGame: p.currentGameId ? named(String(p.currentGameId)) : null,
        expiresAt: p.lookingForPlayersUntil
          ? new Date(p.lookingForPlayersUntil).toISOString()
          : null,
      } satisfies LookingToPartyEntry;
    })
    .filter((entry): entry is LookingToPartyEntry => entry !== null);
}
