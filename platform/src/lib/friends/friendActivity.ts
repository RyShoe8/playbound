/**
 * What a friend is playing and what they are open to playing: the one
 * definition behind the website's and the launcher's Play together panels.
 * The server works it out, and both clients only display the result.
 */
export type GameLink = { slug: string; title: string };
export type FriendOpenTo = { games: GameLink[]; genres: string[]; moreCount: number; downloads: boolean };
export type FriendActivity = { playing: GameLink | null; openTo: FriendOpenTo | null };

const SHOWN = 5;

export function friendActivity(
  presence: { status?: string; currentGameId?: string | null } | null | undefined,
  preferences: { mode?: string; games?: string[]; genres?: string[]; downloads?: boolean } | null | undefined,
  titles: ReadonlyMap<string, string>
): FriendActivity {
  // Presence also carries the game someone is only looking at: only "playing" counts.
  const slug = presence?.status === "playing" ? presence.currentGameId : null;
  const title = slug ? titles.get(slug) : undefined;
  return { playing: slug && title ? { slug, title } : null, openTo: openTo(preferences, titles) };
}

/** "Any multiplayer game" is the default rather than a stated preference, so it shows nothing. */
function openTo(preferences: Parameters<typeof friendActivity>[1], titles: ReadonlyMap<string, string>): FriendOpenTo | null {
  const downloads = Boolean(preferences?.downloads);
  if (preferences?.mode === "games") {
    // A game that has left the catalog cannot be played or linked to.
    const games = (preferences.games || []).flatMap((slug) => {
      const title = titles.get(slug);
      return title ? [{ slug, title }] : [];
    });
    if (!games.length) return null;
    return { games: games.slice(0, SHOWN), genres: [], moreCount: Math.max(0, games.length - SHOWN), downloads };
  }
  if (preferences?.mode === "genres" && preferences.genres?.length) {
    return { games: [], genres: preferences.genres.slice(0, SHOWN), moreCount: Math.max(0, preferences.genres.length - SHOWN), downloads };
  }
  return null;
}

/** Slugs that need a title for `friendActivity`. */
export function activityGameSlugs(
  presence: { status?: string; currentGameId?: string | null } | null | undefined,
  preferences: { mode?: string; games?: string[] } | null | undefined
): string[] {
  return [
    ...(presence?.status === "playing" && presence.currentGameId ? [presence.currentGameId] : []),
    ...(preferences?.mode === "games" ? preferences.games || [] : []),
  ];
}
