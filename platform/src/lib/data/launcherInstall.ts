import type { LauncherInstall } from "@/lib/launcherInstall";

/**
 * Seed recipes mirrored from launcher/catalog.js.
 * Used by seed:launcher-install and as fallback when Mongo has no recipe yet.
 */
export const launcherInstallBySlug: Record<string, LauncherInstall> = {
  openra: {
    enabled: true,
    kind: "github-zip",
    repo: "OpenRA/OpenRA",
    assetPattern: "x64-winportable\\.zip$",
    exeHint: "RedAlert|OpenRA",
    connectArgs: ["Game.Connect={host}:{port}"],
  },
  "endless-sky": {
    enabled: true,
    kind: "github-zip",
    repo: "endless-sky/endless-sky",
    assetPattern: "^EndlessSky-win64-.*\\.zip$",
    exeHint: "EndlessSky",
  },
  "warzone-2100": {
    enabled: true,
    kind: "github-zip",
    repo: "Warzone2100/warzone2100",
    assetPattern: "win_x64_archive\\.zip$",
    exeHint: "warzone2100",
    addons: [
      {
        id: "hq-videos",
        name: "High Quality Campaign Videos",
        description: "Includes high-quality video sequences for the single-player campaign. (1GB)",
        url: "https://sourceforge.net/projects/warzone2100/files/warzone2100/Videos/high-quality-en/sequences.wz/download",
        fileName: "sequences.wz",
      },
    ],
  },
  supertuxkart: {
    enabled: true,
    kind: "github-zip",
    repo: "supertuxkart/stk-code",
    assetPattern: "-win\\.zip$",
    exeHint: "supertuxkart",
  },
  luanti: {
    enabled: true,
    kind: "github-zip",
    repo: "luanti-org/luanti",
    assetPattern: "-win64\\.zip$",
    exeHint: "luanti|minetest",
    connectArgs: ["--go", "--address", "{host}", "--port", "{port}"],
  },
  naev: {
    enabled: true,
    kind: "github-installer",
    repo: "naev/naev",
    assetPattern: "win64\\.exe$",
    knownExePaths: [
      "%PROGRAMFILES%\\Naev\\naev.exe",
      "%PROGRAMFILES(X86)%\\Naev\\naev.exe",
      "%PROGRAMFILES%\\naev\\naev.exe",
      "%LOCALAPPDATA%\\Programs\\naev\\naev.exe",
      "%LOCALAPPDATA%\\Programs\\Naev\\naev.exe",
    ],
  },
  xonotic: {
    enabled: true,
    kind: "direct-zip",
    url: "https://dl.xonotic.org/xonotic-0.8.6.zip",
    exeHint: "xonotic.*x64|xonotic",
    connectArgs: ["+connect", "{host}:{port}"],
  },
  mindustry: {
    enabled: true,
    kind: "github-jar",
    repo: "Anuken/Mindustry",
    assetPattern: "^Mindustry\\.jar$",
    note: "Requires Java 17+ (Adoptium Temurin).",
  },
  "battle-for-wesnoth": {
    enabled: true,
    kind: "direct-installer",
    url: "https://sourceforge.net/projects/wesnoth/files/wesnoth-1.18/wesnoth-1.18.7/wesnoth-1.18.7-win64.exe/download",
    fileName: "wesnoth-1.18.7-win64.exe",
    versionLabel: "1.18.7",
    knownExePaths: [
      "%PROGRAMFILES%\\Battle for Wesnoth 1.18\\wesnoth.exe",
      "%PROGRAMFILES(X86)%\\Battle for Wesnoth 1.18\\wesnoth.exe",
      "%LOCALAPPDATA%\\Programs\\Battle for Wesnoth 1.18\\wesnoth.exe",
      "%LOCALAPPDATA%\\Programs\\Battle for Wesnoth\\wesnoth.exe",
    ],
  },
  "0ad": {
    enabled: true,
    kind: "direct-installer",
    url: "https://releases.wildfiregames.com/0ad-0.28.0-win64.exe",
    fileName: "0ad-0.28.0-win64.exe",
    versionLabel: "0.28.0",
    knownExePaths: [
      "%PROGRAMFILES%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%PROGRAMFILES(X86)%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%LOCALAPPDATA%\\Programs\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%LOCALAPPDATA%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
    ],
    installRoot: "%PROGRAMFILES%\\0 A.D. alpha",
  },
  veloren: {
    enabled: true,
    kind: "direct-installer",
    url: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/windows-installer-x86_64",
    fileName: "airshipper-installer.exe",
    versionLabel: "0.17.0",
    note: "Installs Airshipper, which downloads and updates Veloren.",
    exeHint: "airshipper",
    registryTitles: ["Airshipper", "Veloren"],
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\Airshipper\\airshipper.exe",
      "%LOCALAPPDATA%\\airshipper\\airshipper.exe",
      "%PROGRAMFILES%\\Airshipper\\airshipper.exe",
      "%PROGRAMFILES(X86)%\\Airshipper\\airshipper.exe",
    ],
  },
  openttd: {
    enabled: true,
    kind: "openttd-zip",
    exeHint: "openttd",
  },
  "beyond-all-reason": {
    enabled: true,
    kind: "github-installer",
    repo: "beyond-all-reason/BYAR-Chobby",
    assetPattern: "Beyond-All-Reason-.*\\.exe$",
    note: "Opens the BAR launcher — click Update, then Start.",
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond-All-Reason\\Beyond All Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond All Reason\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond All Reason\\Beyond All Reason.exe",
      "%PROGRAMFILES%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%PROGRAMFILES%\\Beyond All Reason\\Beyond All Reason.exe",
      "%PROGRAMFILES(X86)%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
    ],
  },
  "shattered-pixel-dungeon": {
    enabled: true,
    kind: "github-zip",
    repo: "00-Evan/shattered-pixel-dungeon",
    assetPattern: "Windows\\.zip$",
    exeHint: "ShatteredPD|Shattered",
  },
  supertux: {
    enabled: true,
    kind: "github-zip",
    repo: "SuperTux/supertux",
    assetPattern: "win64-portable\\.zip$",
    exeHint: "supertux",
  },
  "zero-k": {
    enabled: true,
    kind: "direct-exe",
    url: "https://zero-k.info/lobby/Zero-K.exe",
    note: "Downloads the Zero-K lobby, which fetches the game on first run.",
  },
  hedgewars: {
    enabled: true,
    kind: "direct-installer",
    url: "https://www.hedgewars.org/download/releases/Hedgewars-1.0.0.exe",
    knownExePaths: [
      "%PROGRAMFILES%\\Hedgewars\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Hedgewars\\hedgewars.exe",
      "%LOCALAPPDATA%\\Programs\\Hedgewars\\hedgewars.exe",
    ],
  },
  unvanquished: {
    enabled: true,
    kind: "github-zip",
    repo: "Unvanquished/updater",
    assetPattern: "UnvUpdaterWin\\.zip$",
    exeHint: "UnvanquishedUpdater|updater",
    note: "Installs the Unvanquished updater, which downloads the game.",
    connectArgs: ["+connect", "{host}:{port}"],
  },
  openciv3: {
    enabled: true,
    kind: "github-zip",
    repo: "C7-Game/OpenCiv3",
    assetPattern: "OpenCiv3_.*-Windows\\.zip$",
    exeHint: "OpenCiv3",
    note: "Runs standalone with placeholder art. PlayBound sets windowed 1920×1080 (Library → Display to change). Optional: install Civilization III Complete (Steam/GOG) for original graphics — OpenCiv3 auto-detects it.",
  },
  freeciv: {
    enabled: true,
    kind: "direct-installer",
    url: "https://files.freeciv.org/packages/windows/Freeciv-3.2.5-msys2-win64-10-gtk4-setup.exe",
    fileName: "Freeciv-3.2.5-msys2-win64-10-gtk4-setup.exe",
    versionLabel: "3.2.5",
    exeHint: "freeciv-gtk4",
    registryTitles: ["Freeciv"],
    knownExePaths: [
      "%PROGRAMFILES%\\Freeciv-3.2.5-win64-10-client-gtk4\\freeciv-gtk4.exe",
      "%PROGRAMFILES(X86)%\\Freeciv-3.2.5-win64-10-client-gtk4\\freeciv-gtk4.exe",
      "%PROGRAMFILES%\\Freeciv-3.2.5-msys2-win64-10-gtk4\\freeciv-gtk4.exe",
      "%PROGRAMFILES(X86)%\\Freeciv-3.2.5-msys2-win64-10-gtk4\\freeciv-gtk4.exe",
      "%LOCALAPPDATA%\\Programs\\Freeciv-3.2.5-win64-10-client-gtk4\\freeciv-gtk4.exe",
    ],
    connectArgs: ["--server", "{host}", "--port", "{port}"],
    note: "Opens the official Freeciv GTK4 setup — finish the wizard, then Play.",
  },
  "villagers-and-heroes": {
    enabled: true,
    kind: "direct-installer",
    url: "https://villagersandheroes.com/VHSetup.exe",
    fileName: "VHSetup.exe",
    exeHint: "Villagers|VH|MadOtter",
    registryTitles: ["Villagers and Heroes", "Villagers & Heroes"],
    knownExePaths: [
      "%PROGRAMFILES%\\Villagers and Heroes\\Villagers and Heroes.exe",
      "%PROGRAMFILES(X86)%\\Villagers and Heroes\\Villagers and Heroes.exe",
      "%PROGRAMFILES%\\Mad Otter Games\\Villagers and Heroes\\Villagers and Heroes.exe",
      "%PROGRAMFILES(X86)%\\Mad Otter Games\\Villagers and Heroes\\Villagers and Heroes.exe",
      "%LOCALAPPDATA%\\Programs\\Villagers and Heroes\\Villagers and Heroes.exe",
      "%LOCALAPPDATA%\\Villagers and Heroes\\Villagers and Heroes.exe",
    ],
    note: "Official Mad Otter PC setup — finish the wizard, then Play. Steam not required.",
  },
  flightgear: {
    enabled: true,
    kind: "direct-installer",
    url: "https://download.flightgear.org/release-2024.1/flightgear-2024.1.6-windows-amd64.exe",
    fileName: "flightgear-2024.1.6-windows-amd64.exe",
    versionLabel: "2024.1.6",
    exeHint: "fgfs",
    registryTitles: ["FlightGear"],
    knownExePaths: [
      "%PROGRAMFILES%\\FlightGear 2024.1.6\\bin\\fgfs.exe",
      "%PROGRAMFILES(X86)%\\FlightGear 2024.1.6\\bin\\fgfs.exe",
      "%PROGRAMFILES%\\FlightGear\\bin\\fgfs.exe",
      "%PROGRAMFILES(X86)%\\FlightGear\\bin\\fgfs.exe",
      "%LOCALAPPDATA%\\Programs\\FlightGear 2024.1.6\\bin\\fgfs.exe",
      "%LOCALAPPDATA%\\Programs\\FlightGear\\bin\\fgfs.exe",
    ],
    connectArgs: ["--multiplay=out,10,{host},{port}"],
    note: "Opens the official FlightGear Windows setup — finish the wizard, then Play.",
  },
  freedoom: {
    enabled: true,
    kind: "github-zip",
    repo: "ZDoom/gzdoom",
    assetPattern: "Windows-64bit\\.zip$|win64.*\\.zip$",
    exeHint: "gzdoom",
    overlayUrl: "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
    overlayFileName: "freedoom-0.13.0.zip",
    note: "Bundles the GZDoom source port with Freedoom Phase 1 & 2 IWADs for one-click play.",
  },
  "lincity-ng": {
    enabled: true,
    kind: "github-zip",
    repo: "lincity-ng/lincity-ng",
    assetPattern: "win64.*\\.zip$|windows.*\\.zip$|\\.zip$",
    exeHint: "lincity|lincity-ng",
  },
  openarena: {
    enabled: true,
    kind: "direct-zip",
    url: "https://downloads.sourceforge.net/project/oarena/openarena-0.8.8.zip",
    exeHint: "openarena",
    connectArgs: ["+connect", "{host}:{port}"],
  },
  wolfenstein: {
    enabled: true,
    kind: "github-zip",
    repo: "ECWolfEngine/ECWolf",
    assetPattern: "ecwolf.*windows.*\\.zip$|win64.*\\.zip$|\\.zip$",
    note: "ECWolf source port — add legal Wolf3D shareware/data separately.",
    exeHint: "ecwolf",
  },
  everquest: {
    enabled: true,
    kind: "external",
    url: "https://www.everquest.com",
    note: "Prefer an edition: EverQuest Live (Daybreak LaunchPad), Project Quarm, or Project 1999.",
  },
  starcraft: {
    enabled: true,
    kind: "external",
    url: "https://starcraft.com",
    note: "Install StarCraft Remastered free via Battle.net.",
  },
  "diablo-2": {
    enabled: true,
    kind: "external",
    url: "https://diablo2.blizzard.com",
    note: "Diablo II: Resurrected via Battle.net (or legal classic).",
  },
  "war-thunder": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/236390/War_Thunder/",
    note: "Steam or Gaijin launcher.",
  },
  "world-of-tanks": {
    enabled: true,
    kind: "external",
    url: "https://worldoftanks.com",
    note: "Install via Wargaming Game Center.",
  },
  "apex-legends": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/1172470/Apex_Legends/",
    note: "Steam or EA App.",
  },
  hearthstone: {
    enabled: true,
    kind: "external",
    url: "https://hearthstone.blizzard.com",
    note: "Install via Battle.net.",
  },
  "team-fortress-2": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/440/Team_Fortress_2/",
    note: "Free on Steam.",
  },
  "genshin-impact": {
    enabled: true,
    kind: "external",
    url: "https://genshin.hoyoverse.com",
    note: "Official Hoyoverse launcher only.",
  },
  "dota-2": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/570/Dota_2/",
    note: "Free on Steam.",
  },
  "league-of-legends": {
    enabled: true,
    kind: "external",
    url: "https://www.leagueoflegends.com",
    note: "Riot Client only — do not use unofficial clients.",
  },
  valorant: {
    enabled: true,
    kind: "external",
    url: "https://playvalorant.com",
    note: "Riot Client + Vanguard required.",
  },
  "counter-strike-2": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/730/CounterStrike_2/",
    note: "Free on Steam.",
  },
  "quake-champions": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/611500/Quake_Champions/",
    note: "Steam or Bethesda.net.",
  },

  /*
   * ── MMOs that ship their own installer ────────────────────────────
   *
   * These were seeded pointing at Steam, which meant "install" opened a store
   * page. Each one publishes a real installer that downloads without a login,
   * so the launcher can fetch and run it directly instead. Every URL below was
   * checked with a ranged GET and returned a real binary.
   *
   * What the user gets is the game's own installer/updater — the multi-GB
   * client download still happens inside that, which is unavoidable for
   * patch-based MMOs and is exactly how these games install normally.
   *
   * On detection: registryTitles is the load-bearing part, because the launcher
   * matches the Windows uninstall DisplayName by prefix and then resolves the
   * exe from DisplayIcon/InstallLocation. knownExePaths are accelerators for
   * default install locations — they let detection succeed without shelling out
   * to PowerShell, but a miss just falls through to the registry. Anyone who
   * installs to a custom directory is covered by the registry path.
   */

  "albion-online": {
    enabled: true,
    kind: "direct-installer",
    url: "https://live.albiononline.com/clients/latest/albion-online-setup.exe",
    fileName: "albion-online-setup.exe",
    exeHint: "Albion.?Online",
    registryTitles: ["Albion Online"],
    knownExePaths: [
      "%PROGRAMFILES%\\AlbionOnline\\launcher\\Albion-Online.exe",
      "%PROGRAMFILES%\\Albion Online\\launcher\\Albion-Online.exe",
      "%LOCALAPPDATA%\\Programs\\AlbionOnline\\launcher\\Albion-Online.exe",
      "%LOCALAPPDATA%\\AlbionOnline\\launcher\\Albion-Online.exe",
    ],
    note: "Installs the Albion Online launcher, which then downloads the game.",
  },

  "guild-wars-2": {
    enabled: true,
    kind: "direct-installer",
    // account.arena.net/content/download/gw2/win/64 302s here; using the CDN
    // target directly avoids a redirect hop that rejects HEAD requests.
    url: "https://cloudfront.guildwars2.com/client/branches/Gw2Setup-64.exe",
    fileName: "Gw2Setup-64.exe",
    exeHint: "Gw2-64",
    registryTitles: ["Guild Wars 2"],
    knownExePaths: [
      "%PROGRAMFILES%\\Guild Wars 2\\Gw2-64.exe",
      "%PROGRAMFILES(X86)%\\Guild Wars 2\\Gw2-64.exe",
    ],
    note: "Gw2Setup is installer, updater and client in one — it downloads the game on first run.",
  },

  "lord-of-the-rings-online": {
    enabled: true,
    kind: "direct-installer",
    url: "https://akamai.lotro.com/lotro/lotrolive.exe",
    fileName: "lotrolive.exe",
    exeHint: "lotroclient|LotroLauncher",
    registryTitles: ["The Lord of the Rings Online", "Lord of the Rings Online"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\StandingStoneGames\\The Lord of the Rings Online\\LotroLauncher.exe",
      "%PROGRAMFILES%\\StandingStoneGames\\The Lord of the Rings Online\\LotroLauncher.exe",
      // Pre-Standing-Stone installs still live under the Turbine folder.
      "%PROGRAMFILES(X86)%\\Turbine\\The Lord of the Rings Online\\LotroLauncher.exe",
    ],
    note: "Installs the LOTRO launcher, which then patches the full client.",
  },

  "dc-universe-online": {
    enabled: true,
    kind: "direct-installer",
    url: "https://launch.daybreakgames.com/installer/DCUO_setup.exe?v=23",
    fileName: "DCUO_setup.exe",
    exeHint: "LaunchPad|DCGAME",
    registryTitles: ["DC Universe Online", "DCUO"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Daybreak Game Company\\Installed Games\\DC Universe Online Live\\LaunchPad.exe",
      "%PROGRAMFILES(X86)%\\Sony Online Entertainment\\Installed Games\\DC Universe Online Live\\LaunchPad.exe",
      "%PUBLIC%\\Daybreak Game Company\\Installed Games\\DC Universe Online Live\\LaunchPad.exe",
      "%PUBLIC%\\Sony Online Entertainment\\Installed Games\\DC Universe Online Live\\LaunchPad.exe",
    ],
    note: "Installs the Daybreak launchpad, which then downloads the game.",
  },

  "star-wars-the-old-republic": {
    enabled: true,
    kind: "direct-installer",
    url: "https://cdn-d6patch.swtor.com/swtor/setup/SWTOR_setup.exe",
    fileName: "SWTOR_setup.exe",
    exeHint: "launcher|swtor",
    registryTitles: ["Star Wars", "Star Wars™: The Old Republic", "Star Wars: The Old Republic"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\EA\\BioWare\\Star Wars-The Old Republic\\launcher.exe",
      "%PROGRAMFILES(X86)%\\Electronic Arts\\BioWare\\Star Wars-The Old Republic\\launcher.exe",
      "%PROGRAMFILES%\\EA\\BioWare\\Star Wars-The Old Republic\\launcher.exe",
    ],
    note: "Installs the SWTOR launcher, which then downloads the game.",
  },

  "old-school-runescape": {
    enabled: true,
    kind: "direct-installer",
    url: "https://www.runescape.com/downloads/oldschool.msi",
    fileName: "OldSchool.msi",
    exeHint: "OldSchool|JagexLauncher",
    registryTitles: ["Old School RuneScape", "Jagex Launcher"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Jagex\\Old School RuneScape\\OldSchool.exe",
      "%PROGRAMFILES%\\Jagex\\Old School RuneScape\\OldSchool.exe",
      "%PROGRAMFILES(X86)%\\Jagex Launcher\\JagexLauncher.exe",
      "%LOCALAPPDATA%\\Jagex Launcher\\JagexLauncher.exe",
    ],
    note: "Small client — the game itself streams, so there is no large download.",
  },

  "world-of-sea-battle": {
    enabled: true,
    kind: "direct-installer",
    // Xsolla-hosted launcher build; the GUID is the game's launcher project id,
    // not a per-session token, so the URL is stable across builds.
    url: "https://installer.launcher.xsolla.com/xlauncher-builds/xsolla-launcher-update/786ad960-bdf8-464a-94ff-1c326c963292/bin/installer.exe",
    fileName: "WorldOfSeaBattle-Setup.exe",
    exeHint: "World.?of.?Sea.?Battle|xlauncher",
    registryTitles: ["World of Sea Battle", "Xsolla Launcher"],
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\World of Sea Battle\\World of Sea Battle.exe",
      "%LOCALAPPDATA%\\XsollaLauncher\\xlauncher.exe",
      "%PROGRAMFILES%\\World of Sea Battle\\World of Sea Battle.exe",
    ],
    note: "Installs the Xsolla launcher used by World of Sea Battle.",
  },

  warframe: {
    enabled: true,
    kind: "direct-installer",
    url: "https://content.warframe.com/dl/Warframe.msi",
    fileName: "Warframe.msi",
    exeHint: "Warframe",
    registryTitles: ["Warframe"],
    knownExePaths: [
      "%PROGRAMFILES%\\Warframe\\Tools\\Launcher.exe",
      "%PROGRAMFILES%\\Warframe\\Downloaded\\Public\\Warframe.x64.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Warframe\\Tools\\Launcher.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Warframe\\Warframe.x64.exe",
    ],
    note: "Official Warframe.msi from Digital Extremes. Steam app 230410 is an alternative.",
  },

  "asphalt-legends": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/1815780/Asphalt_Legends/",
    note: "Free on Steam (and Epic). Live-service client — always-online.",
  },

  "tinywind-pixel-pirate-sailing-game": {
    enabled: true,
    kind: "external",
    url: "https://tinywind.io",
    note: "Plays in the browser. No PlayBound desktop installer yet.",
  },

  "mega-man-unlimited": {
    enabled: true,
    kind: "external",
    url: "https://megaphilx.com/index.php/home/games/mega-man-unlimited/",
    note: "Unofficial fangame. Download only from the creator’s site — PlayBound does not host the zip.",
  },

  holocure: {
    enabled: true,
    kind: "itch-zip",
    url: "https://kay-yu.itch.io/holocure",
    fileName: "HoloCure.zip",
    versionLabel: "latest",
    exeHint: "HoloCure|holocure",
    knownExePaths: [
      "%LOCALAPPDATA%\\HoloCure\\HoloCure.exe",
      "%PROGRAMFILES%\\HoloCure\\HoloCure.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
    ],
    note: "Downloads and extracts the official standalone HoloCure build from itch.io.",
  },
};
