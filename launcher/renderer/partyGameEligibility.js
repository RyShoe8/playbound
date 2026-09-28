/** Keep the party picker limited to games PlayBound can actually launch. */
export function catalogGameSupportsParty(game) {
  if (typeof game?.partyLaunchable === "boolean") return game.partyLaunchable;
  if (!(game?.isMultiplayer ?? game?.multiplayer ?? false)) return false;
  if (game.kind !== "external") return true;
  if (typeof game.url !== "string") return false;
  if (game.url.startsWith("steam://")) return true;
  return /^goggalaxy:\/\/openGameView\/\d+$/i.test(game.url) &&
    game.knownExePaths?.some((file) => /\.zip$/i.test(file)) === true;
}
