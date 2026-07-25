import type { Game } from "@/lib/data/types";

/** Browser-first: playable in browser and not an installable desktop title. */
export function isBrowserGame(game: Pick<Game, "browserPlayable" | "launchMethods">): boolean {
  if (game.browserPlayable) return true;
  return game.launchMethods.includes("browser") && !game.launchMethods.includes("install");
}
