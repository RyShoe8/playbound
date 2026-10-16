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
  // Couch-mode games (openSEEK, Hurrican...) are local co-op on paper but play online through the
  // party, so their local-only tags must not hide the button. The server says which ones they are.
  if (game?.couchParty === true && game.partyLaunchable !== false) return true;
  // A singleplayer base game can ship a networked edition (RimWorld Together, Daggerfall Online).
  // The base game's own multiplayer flag says no, so ask the editions, unless the server has said
  // the game cannot be launched for a party at all.
  if (game && game.partyLaunchable !== false && (game.editions || []).some((edition) => (edition.features || []).some((feature) => /^(multiplayer|online multiplayer|online co-op)$/i.test(String(feature).trim())))) return true;
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
