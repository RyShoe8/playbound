import type { Game } from "@/lib/data/types";

/** Use browser play as the desktop action when there is no install method. */
export function isBrowserGame(game: Pick<Game, "browserPlayable" | "launchMethods">): boolean {
  return !game.launchMethods?.includes("install") &&
    (game.browserPlayable || game.launchMethods?.includes("browser") === true);
}
