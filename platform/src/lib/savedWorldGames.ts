/** Client-safe: games whose dedicated server keeps a world between sessions. */
export const SAVED_WORLD_GAMES = new Set(["morrowind"]);

export function supportsSavedWorlds(gameSlug: string | null | undefined): boolean {
  return Boolean(gameSlug && SAVED_WORLD_GAMES.has(gameSlug));
}

export type SavedWorldSummary = { id: string; name: string; lastPlayedAt: string | null };
