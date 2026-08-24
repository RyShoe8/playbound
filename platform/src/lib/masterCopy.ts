import { listGames } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import { listPublicEditionsForGame } from "@/lib/editions";
import { hasChoosableEditions, type Edition } from "@/lib/editionTypes";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { modsForGame, type CatalogModPublic } from "@/lib/mods";

export type MasterCopyEditionUnlock = {
  game: Game;
  edition: Edition;
};

export type MasterCopyUnlocks = {
  games: Game[];
  editions: MasterCopyEditionUnlock[];
  mods: CatalogModPublic[];
};

export type LauncherUnlocksPayload = {
  games: Array<{
    slug: string;
    title: string;
    blurb: string;
    tagline: string;
    coverImage: string | null;
    art: [string, string];
    genres: string[];
    tags: string[];
    approxSize: string | null;
    browserPlayable: boolean;
    launchMethods: string[];
    platforms: string[];
    testing: boolean;
  }>;
  editions: Array<{
    gameSlug: string;
    editionSlug: string;
    editionName: string;
    editionType: string;
    shortDescription: string;
    coverImage: string | null;
    isDefault: boolean;
  }>;
  mods: Array<{
    slug: string;
    title: string;
    tagline: string;
    coverImage: string | null;
    baseGameCoverImage: string | null;
    baseGameSlug: string;
    baseGameTitle: string | null;
    approxSize: string | null;
    art: [string, string];
    downloadKind: CatalogModPublic["downloadKind"];
    platforms: NonNullable<CatalogModPublic["platforms"]>;
    status: string;
    testing: boolean;
    license: string;
    whatItChanges?: string;
  }>;
};

/** Published games whose Requires list includes this slug. Never the slug itself. */
export function gamesRequiringMaster(masterSlug: string, catalog: Game[]): Game[] {
  return catalog.filter(
    (g) => g.slug !== masterSlug && (g.access?.requiresGameSlugs ?? []).includes(masterSlug)
  );
}

export function masterCopyUnlocksEmpty(unlocks: MasterCopyUnlocks): boolean {
  return unlocks.games.length === 0 && unlocks.editions.length === 0 && unlocks.mods.length === 0;
}

/**
 * Reverse of Requires: published games that need this copy, those games'
 * public choosable editions and mods, plus mods whose base game is the master.
 */
export async function listUnlockedByMaster(
  slug: string,
  opts?: { includeTesting?: boolean }
): Promise<MasterCopyUnlocks> {
  const catalog = await listGames(opts);
  const master = catalog.find((g) => g.slug === slug) || null;
  const dependents = gamesRequiringMaster(slug, catalog);

  const editions: MasterCopyEditionUnlock[] = [];
  const mods: CatalogModPublic[] = [];
  const seenMods = new Set<string>();

  function addMods(list: CatalogModPublic[]) {
    for (const mod of list) {
      if (seenMods.has(mod.slug)) continue;
      seenMods.add(mod.slug);
      mods.push(mod);
    }
  }

  const ownMods = await modsForGame(slug, opts);
  addMods(ownMods);

  /*
   * The master's own alternate editions — OpenRCT2 for RollerCoaster Tycoon,
   * OpenMW for Morrowind — unlock no separate game entry, so the dependents
   * loop below never sees them; it only walks games that require this master,
   * not the master itself. They are still exactly what this section promises
   * ("the games, editions, and mods below"), so they are added directly here.
   *
   * Deliberately skips the hasChoosableEditions(≥2) gate the dependents loop
   * applies: that gate exists to avoid advertising "an edition" when a
   * dependent game only has one and installing it normally is the same
   * thing. Here the one edition (OpenRCT2) *is* the alternate to owning the
   * commercial data outright, so it is worth showing even alone.
   */
  if (master) {
    const ownEditions = await listPublicEditionsForGame(master);
    for (const edition of ownEditions) {
      editions.push({ game: master, edition });
    }
  }

  const perDependent = await Promise.all(
    dependents.map(async (game) => {
      const [publicEditions, gameMods] = await Promise.all([
        listPublicEditionsForGame(game),
        modsForGame(game.slug, opts),
      ]);
      return { game, publicEditions, gameMods };
    })
  );

  for (const row of perDependent) {
    if (hasChoosableEditions(row.publicEditions)) {
      for (const edition of row.publicEditions) {
        editions.push({ game: row.game, edition });
      }
    }
    addMods(row.gameMods);
  }

  return { games: dependents, editions, mods };
}

export function toLauncherUnlocks(
  unlocks: MasterCopyUnlocks,
  origin: string,
  master?: Game
): LauncherUnlocksPayload {
  const titles = new Map<string, string>();
  const covers = new Map<string, string | undefined>();
  if (master) {
    titles.set(master.slug, master.title);
    covers.set(master.slug, master.coverImage);
  }
  for (const game of unlocks.games) {
    titles.set(game.slug, game.title);
    covers.set(game.slug, game.coverImage);
  }

  return {
    games: unlocks.games.map((game) => ({
      slug: game.slug,
      title: game.title,
      blurb: game.tagline,
      tagline: game.tagline,
      coverImage: absoluteMediaUrl(game.coverImage, origin),
      art: [game.art.from, game.art.to],
      genres: game.genres || [],
      tags: game.tags || [],
      approxSize: sizeLabelFromMB(game.sizeMB) || null,
      browserPlayable: Boolean(game.browserPlayable),
      launchMethods: Array.isArray(game.launchMethods) ? game.launchMethods : [],
      platforms: Array.isArray(game.platforms) ? game.platforms : [],
      testing: game.status === "testing",
    })),
    editions: unlocks.editions.map(({ game, edition }) => ({
      gameSlug: game.slug,
      editionSlug: edition.slug,
      editionName: edition.name,
      editionType: edition.type,
      shortDescription: edition.shortDescription || "",
      coverImage: absoluteMediaUrl(
        edition.branding.heroImage || edition.branding.logo || game.coverImage || null,
        origin
      ),
      isDefault: Boolean(edition.isDefault),
    })),
    mods: unlocks.mods.map((mod) => ({
      slug: mod.slug,
      title: mod.title,
      tagline: mod.tagline,
      coverImage: absoluteMediaUrl(mod.coverImage, origin),
      baseGameCoverImage: absoluteMediaUrl(covers.get(mod.baseGameSlug), origin),
      baseGameSlug: mod.baseGameSlug,
      baseGameTitle: titles.get(mod.baseGameSlug) || null,
      approxSize: sizeLabelFromMB(mod.sizeMB) || null,
      art: [mod.art.from, mod.art.to],
      downloadKind: mod.downloadKind,
      platforms: Array.isArray(mod.platforms) ? mod.platforms : [],
      status: mod.status || "published",
      testing: mod.status === "testing",
      license: mod.license,
      whatItChanges: mod.whatItChanges,
    })),
  };
}
