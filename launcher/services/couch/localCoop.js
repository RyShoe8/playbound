"use strict";

const LOCAL_PLAY_MARKERS = new Set([
  "couch co-op",
  "split-screen co-op",
  "local multiplayer",
  "split-screen",
  "shared/split screen pvp",
]);

/** Null means the catalog does not claim simultaneous local play. */
function localCoopPlayerCapacity(game) {
  const labels = [...(game?.features || []), ...(game?.tags || [])];
  if (labels.some((label) => String(label).toLowerCase() === "hotseat")) return null;
  if (!labels.some((label) => LOCAL_PLAY_MARKERS.has(String(label).toLowerCase()))) return null;
  const listed = Number(game.maxPlayers);
  return Number.isInteger(listed) && listed >= 2 ? Math.min(4, listed) : 4;
}

module.exports = { localCoopPlayerCapacity };
