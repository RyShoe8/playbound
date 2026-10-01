/**
 * Purchase/install handoffs and executable identity for DB-only catalog games.
 * The catalog wave writes only these named launcherInstall subfields, preserving
 * every other launcher recipe field curated in Mongo. No paid game is hosted or
 * redistributed by PlayBound.
 */
export type DraftInstallPickup = {
  storeUrl: string;
  exeHint: string;
  knownExePaths: string[];
  registryTitles?: string[];
  /** Exact stale Steam handoff that should become the owner's chosen store. */
  replaceSteamUrl?: string;
  /** Do not invent a storefront Install action when only an uploaded package exists. */
  acquisitionAvailable?: boolean;
};

export const DRAFT_INSTALL_PICKUP: Readonly<Record<string, DraftInstallPickup>> = {
  "deus-ex-goty-edition": {
    storeUrl: "https://www.gog.com/en/game/deus_ex_goty",
    exeHint: "DeusEx.exe",
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\GOG Galaxy\\Games\\Deus Ex GOTY\\System\\DeusEx.exe",
      "%PROGRAMFILES%\\GOG Galaxy\\Games\\Deus Ex GOTY\\System\\DeusEx.exe",
      "C:\\GOG Games\\Deus Ex GOTY\\System\\DeusEx.exe",
      "%STEAM%\\steamapps\\common\\Deus Ex\\System\\DeusEx.exe",
      "System\\DeusEx.exe",
    ],
    registryTitles: ["Deus Ex: Game of the Year Edition", "Deus Ex GOTY"],
  },
  "risk-of-rain-2": {
    storeUrl: "steam://run/632360",
    exeHint: "Risk of Rain 2.exe",
    knownExePaths: ["Risk of Rain 2.exe", "%STEAM%\\steamapps\\common\\Risk of Rain 2\\Risk of Rain 2.exe"],
    registryTitles: ["Risk of Rain 2"],
  },
  "battlefield-1942-anthology": {
    storeUrl: "https://www.ea.com/games/battlefield/battlefield-1942",
    exeHint: "BF1942.exe",
    knownExePaths: [
      "BF1942.exe",
      "C:\\Program Files (x86)\\EA GAMES\\Battlefield 1942\\BF1942.exe",
      "C:\\Program Files (x86)\\EA GAMES\\Battlefield 1942 WWII Anthology\\BF1942.exe",
    ],
    registryTitles: ["Battlefield 1942", "Battlefield 1942: World War II Anthology", "Battlefield 1942 WWII Anthology"],
    acquisitionAvailable: false,
  },
  "aneurism-iv": {
    storeUrl: "steam://run/2773280",
    exeHint: "ANEURISM IV.exe",
    knownExePaths: ["ANEURISM IV.exe"],
    registryTitles: ["ANEURISM IV"],
  },
  "stardew-valley": {
    storeUrl: "https://www.gog.com/en/game/stardew_valley",
    replaceSteamUrl: "steam://run/413150",
    exeHint: "Stardew Valley.exe",
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\GOG Galaxy\\Games\\Stardew Valley\\Stardew Valley.exe",
      "C:\\GOG Games\\Stardew Valley\\Stardew Valley.exe",
      "Stardew Valley.exe",
    ],
    registryTitles: ["Stardew Valley"],
  },
  starbound: {
    storeUrl: "https://www.gog.com/en/game/starbound",
    replaceSteamUrl: "steam://run/211820",
    exeHint: "starbound.exe",
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\GOG Galaxy\\Games\\Starbound\\win64\\starbound.exe",
      "C:\\GOG Games\\Starbound\\win64\\starbound.exe",
      "win64\\starbound.exe",
    ],
    registryTitles: ["Starbound"],
  },
  necesse: {
    storeUrl: "steam://run/1169040", exeHint: "Necesse.exe",
    knownExePaths: ["Necesse.exe"], registryTitles: ["Necesse"],
  },
  "dont-starve-together": {
    storeUrl: "steam://run/322330", exeHint: "dontstarve_steam_x64.exe",
    knownExePaths: ["bin64\\dontstarve_steam_x64.exe", "dontstarve_steam_x64.exe"],
    registryTitles: ["Don't Starve Together"],
  },
  barotrauma: {
    storeUrl: "steam://run/602960", exeHint: "Barotrauma.exe",
    knownExePaths: ["Barotrauma.exe"], registryTitles: ["Barotrauma"],
  },
  factorio: {
    storeUrl: "steam://run/427520", exeHint: "factorio.exe",
    knownExePaths: ["bin\\x64\\factorio.exe", "factorio.exe"],
    registryTitles: ["Factorio"],
  },
  "core-keeper": {
    storeUrl: "steam://run/1621690", exeHint: "CoreKeeper.exe",
    knownExePaths: ["CoreKeeper.exe"], registryTitles: ["Core Keeper"],
  },
  rimworld: {
    storeUrl: "steam://run/294100", exeHint: "RimWorldWin64.exe",
    knownExePaths: ["RimWorldWin64.exe"], registryTitles: ["RimWorld"],
  },
  "counter-strike-source": {
    storeUrl: "steam://run/240", exeHint: "hl2.exe",
    knownExePaths: ["%STEAM%\\steamapps\\common\\Counter-Strike Source\\hl2.exe"],
    registryTitles: ["Counter-Strike: Source"],
  },
  unturned: {
    storeUrl: "steam://run/304930", exeHint: "Unturned.exe",
    knownExePaths: ["Unturned.exe"], registryTitles: ["Unturned"],
  },
  "vintage-story": {
    storeUrl: "https://www.vintagestory.at/store/category/1-game-account-game-servers/",
    exeHint: "Vintagestory.exe",
    knownExePaths: ["%APPDATA%\\Vintagestory\\Vintagestory.exe", "Vintagestory.exe"],
    registryTitles: ["Vintage Story"],
  },
};
