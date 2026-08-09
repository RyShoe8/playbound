import type { Game } from "@/lib/data/types";

const MULTIPLAYER_MARKERS = [
  "multiplayer",
  "multi-player",
  "co-op",
  "coop",
  "hotseat",
  "lan support",
  "dedicated servers",
  "split-screen",
  "online multiplayer",
  "team play",
  "cross-play",
  "crossplay",
];

/** True when catalog metadata indicates multiplayer / co-op support. */
export function isMultiplayerGame(
  game: Pick<Game, "features" | "tags"> | { features?: string[]; tags?: string[]; multiplayer?: boolean } | null | undefined
): boolean {
  if (!game) return false;
  if ("multiplayer" in game && game.multiplayer === true) return true;
  if ("multiplayer" in game && game.multiplayer === false) return false;

  const haystack = [...(game.features || []), ...(game.tags || [])]
    .map((s) => String(s).toLowerCase())
    .join(" | ");

  return MULTIPLAYER_MARKERS.some((m) => haystack.includes(m));
}
