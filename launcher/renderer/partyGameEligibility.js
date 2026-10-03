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

/** Match the website's card CTA for online play, including store-launched games. */
export function catalogGameSupportsOnlineParty(game) {
  if (!game || game.isMultiplayer === false) return false;
  // In the launcher catalog `multiplayer` is the legacy server-browser flag,
  // not the broader isMultiplayer flag. Only use it for older catalog rows.
  if (game.isMultiplayer == null && game.multiplayer === false) return false;
  const values = [...(game.features || []), ...(game.tags || [])].map((value) => String(value).trim());
  if (values.some((value) => /^(multiplayer|online multiplayer|online co-op|dedicated servers|matchmaking|mmo|mmorpg|pvp|cross-play|crossplay|lan support|lan)$/i.test(value)) || game.launchMethods?.includes("server")) return true;
  const hasCoop = values.some((value) => /^(co-op|coop|cooperative)$/i.test(value));
  const localOnly = values.some((value) => /^(couch co-op|split-screen co-op|local co-op|local multiplayer|hotseat)$/i.test(value));
  return hasCoop && !localOnly;
}
