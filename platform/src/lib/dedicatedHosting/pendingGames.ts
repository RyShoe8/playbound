/** Games we intend to add to Dedicated Basic but cannot currently provision.
 * These are informational listings, never tier profiles or server choices. */
export const PENDING_DEDICATED_GAMES = [
  {
    gameSlug: "aneurism-iv",
    title: "ANEURISM IV",
    requirement: "Needs a Steam owner ID and isolated server ports before multiple rooms can run on the VPS.",
  },
  {
    gameSlug: "risk-of-rain-2",
    title: "Risk of Rain 2",
    requirement: "Needs a usable Windows server download and a successful Linux-hosted client join test.",
  },
  {
    gameSlug: "starbound",
    title: "Starbound",
    requirement: "Needs server files from a Steam account that owns the game; anonymous SteamCMD did not provide them.",
  },
  {
    gameSlug: "stardew-valley",
    title: "Stardew Valley",
    requirement: "Needs a licensed game install and a verified headless server setup.",
  },
  {
    gameSlug: "vintage-story",
    title: "Vintage Story",
    requirement: "Needs the official server download from a Vintage Story game account.",
  },
] as const;

const pendingSlugs = new Set<string>(PENDING_DEDICATED_GAMES.map((game) => game.gameSlug));

export function isPendingDedicatedGame(gameSlug: string): boolean {
  return pendingSlugs.has(gameSlug);
}

export function isPendingDedicatedProfile(profileKey: string): boolean {
  return isPendingDedicatedGame(profileKey.split(":", 1)[0]);
}
