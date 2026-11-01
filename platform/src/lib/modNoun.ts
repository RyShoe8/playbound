/**
 * What a game calls the add-ons PlayBound lists for it.
 *
 * Underneath they are all catalog mods: installed, updated and played by the
 * same machinery. But a Visual Pinball X table is the thing you play, not a
 * modification of something else, and "Mods for Visual Pinball X" reads as
 * nonsense to a pinball player. Only the words change; URLs (?tab=mods,
 * /mods/<slug>) stay the same so nothing that links to them breaks.
 */
export type ModNoun = { one: string; many: string };

const DEFAULT: ModNoun = { one: "mod", many: "mods" };

const BY_GAME: Record<string, ModNoun> = {
  "visual-pinball-x": { one: "table", many: "tables" },
};

export function modNounFor(gameSlug: string | null | undefined): ModNoun {
  return (gameSlug && BY_GAME[gameSlug]) || DEFAULT;
}
