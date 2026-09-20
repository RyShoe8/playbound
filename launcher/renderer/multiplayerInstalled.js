/** Slugs that represent completed, locally playable installs. */
export function readyInstalledGameSlugs(installed) {
  return new Set(
    (Array.isArray(installed) ? installed : [])
      .filter((game) => game?.slug && !game.pending && (game.exe || game.installedEditions?.length))
      .map((game) => game.slug)
  );
}
