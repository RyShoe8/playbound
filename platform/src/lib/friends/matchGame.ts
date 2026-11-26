import { acceptsGame, type MatchGame, type PlayPreferences } from "./playPreferences";
import { editionsFromRow, type LibraryEditionRow } from "@/lib/library/installedEditions";
import { isBaseEditionSlug } from "@/lib/playTogether/editionMatch";

export type MatchInstall = LibraryEditionRow & { gameSlug: string; platform?: string };
export type MatchPlayer = { preferences: PlayPreferences; installs: MatchInstall[] };

/** Prefer compatible installed editions; never quietly match different mods/builds. */
export function selectMatchGame(games: (MatchGame & { requiredEditionSlug?: string | null })[], a: MatchPlayer, b: MatchPlayer) {
  const allowed = games.filter(game => acceptsGame(a.preferences, game) && acceptsGame(b.preferences, game));
  for (const game of allowed) {
    for (const left of a.installs.filter(row => row.gameSlug === game.slug)) {
      for (const right of b.installs.filter(row => row.gameSlug === game.slug)) {
        if ((left.platform || "desktop") !== (right.platform || "desktop")) continue;
        const x = [...editionsFromRow(left)].filter(e => !isBaseEditionSlug(e));
        const y = [...editionsFromRow(right)].filter(e => !isBaseEditionSlug(e));
        const editionSlug = x.find(e => y.includes(e) && (!game.requiredEditionSlug || e === game.requiredEditionSlug));
        if (game.requiredEditionSlug && !editionSlug) continue;
        if (editionSlug || (!x.length && !y.length)) return { game, editionSlug };
      }
    }
  }
  // Download consent applies to both people, as on the homepage.
  const game = allowed.find(g => g.free && a.preferences.downloads && b.preferences.downloads);
  return game ? { game, editionSlug: game.requiredEditionSlug || undefined } : null;
}
