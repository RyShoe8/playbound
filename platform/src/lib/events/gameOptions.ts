import { supportsMultiplayer } from "@/lib/multiplayer/support";

type EventGameCandidate = {
  slug: string;
  title: string;
  coverImage?: string | null;
  features?: string[];
  tags?: string[];
  launchMethods?: string[];
  multiplayer?: boolean;
};

/** The caller supplies the published catalog; event games must also be multiplayer. */
export function eventGameOptions(games: EventGameCandidate[]) {
  return games.filter(supportsMultiplayer).map((game) => ({
    slug: game.slug,
    title: game.title,
    coverImage: game.coverImage || null,
  }));
}
