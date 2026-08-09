import { hasServerProvider } from "@/lib/servers/registry";
import { isMultiplayerGame } from "@/lib/playTogether/multiplayer";
import type { JoinCapabilityResult } from "@/lib/playTogether/types";
import type { Game } from "@/lib/data/types";

/**
 * Answer: "Can I join this friend's activity?" without baking mechanisms into UI.
 */
export function resolveJoinCapability(opts: {
  game: Pick<Game, "slug" | "title" | "features" | "tags" | "browserPlayable"> | null | undefined;
  friendStatus: string;
  friendGameId?: string | null;
  editionId?: string | null;
}): JoinCapabilityResult {
  const { game, friendStatus, friendGameId, editionId } = opts;
  const slug = friendGameId || game?.slug;

  if (!slug || friendStatus !== "playing") {
    return {
      capability: "unsupported",
      label: "Not playing",
      href: null,
      reason: "Friend is not in an active game session",
    };
  }

  if (!game || !isMultiplayerGame(game)) {
    return {
      capability: "unsupported",
      label: "Single-player",
      href: `/games/${encodeURIComponent(slug)}`,
      reason: "Game is not known to support multiplayer",
    };
  }

  const editionQ = editionId ? `&edition=${encodeURIComponent(editionId)}` : "";

  if (hasServerProvider(slug)) {
    return {
      capability: "supported",
      label: "Join Game",
      href: `/servers?game=${encodeURIComponent(slug)}${editionQ}`,
      reason: "Open the server browser for this game",
    };
  }

  if (game.browserPlayable) {
    return {
      capability: "supported",
      label: "Play",
      href: `/games/${encodeURIComponent(slug)}/play`,
      reason: "Browser-playable multiplayer",
    };
  }

  return {
    capability: "requiresManualJoin",
    label: "Open Game",
    href: `/games/${encodeURIComponent(slug)}`,
    reason: "Launch the game and join in-game or via Discord",
  };
}
