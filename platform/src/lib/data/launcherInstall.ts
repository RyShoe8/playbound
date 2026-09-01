import type { LauncherInstall } from "@/lib/launcherInstall";
import {
  ARENA_GAMEFILES_FILE,
  ARENA_GAMEFILES_URL,
  TES_ARENA_EXE_HINT,
  TES_ARENA_KNOWN_EXE_PATHS,
} from "./tesArenaAssets";

/**
 * Seed recipes mirrored from launcher/catalog.js.
 * Used by seed:launcher-install and as fallback when Mongo has no recipe yet.
 */
export const launcherInstallBySlug: Record<string, LauncherInstall> = {
  "ye-guild-clerk": {
    enabled: true,
    kind: "external",
    url: "steam://run/3715020",
    steamAppId: "3715020",
    versionLabel: "Steam",
    note: "Installs or launches the full free Steam release directly.",
  },
  "goldeneye-source": {
    enabled: true,
    kind: "direct-installer",
    url: "https://mirror.playbound.club/games/goldeneye-source/5.0.6/GoldenEye_Source_v5.0.6_full.exe",
    fileName: "GoldenEye_Source_v5.0.6_full.exe",
    versionLabel: "5.0.6",
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\sourcemods\\gesource\\gesource_run.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\sourcemods\\gesource_run.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\sourcemods\\gesource\\gesource_run.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\sourcemods\\gesource_run.exe",
    ],
    connectArgs: ["+connect", "{host}:{port}"],
    steamPrerequisites: [{ appId: "218", name: "Source SDK Base 2007" }],
    note: "Installs Source SDK Base 2007 through Steam first, then runs the official GoldenEye: Source setup.",
  },
  "volleyball-legends": {
    enabled: true,
    kind: "direct-installer",
    url: "https://setup.rbxcdn.com/RobloxPlayerInstaller.exe",
    fileName: "RobloxPlayerInstaller.exe",
    versionLabel: "Roblox",
    exeHint: "RobloxPlayerBeta",
    registryTitles: ["Roblox", "Roblox Player"],
    knownExePaths: [
      "%LOCALAPPDATA%\\Roblox\\Versions\\*\\RobloxPlayerBeta.exe",
      "%LOCALAPPDATA%\\Programs\\Roblox\\RobloxPlayerBeta.exe",
      "%PROGRAMFILES%\\Roblox\\Versions\\*\\RobloxPlayerBeta.exe",
      "%PROGRAMFILES(X86)%\\Roblox\\Versions\\*\\RobloxPlayerBeta.exe",
    ],
    note: "Installs the official Roblox Player and launches Volleyball Legends directly.",
  },
  "dune-legacy": {
    enabled: true,
    kind: "direct-installer",
    url: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.5-Windows-x64.exe",
    urlMac: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.5-macOS.dmg",
    urlLinux: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.3-Linux-x64.tar.gz",
    fileName: "DuneLegacy-0.99.5-Windows-x64.exe",
    versionLabel: "0.99.5",
    exeHint: "dunelegacy",
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\Dune Legacy\\dunelegacy.exe",
      "%PROGRAMFILES%\\Dune Legacy\\dunelegacy.exe",
      "%PROGRAMFILES(X86)%\\Dune Legacy\\dunelegacy.exe",
      "dunelegacy.exe",
    ],
    note: "Official standalone Windows installer with bundled Dune II PAK assets.",
  },
  "c-dogs-retrarch": {
    enabled: true,
    kind: "github-zip",
    repo: "cxong/cdogs-sdl",
    assetPattern: "C-Dogs\\.SDL-.*-win32\\.zip$",
    exeHint: "C-DogsSDL",
    versionLabel: "latest",
    note: "Official portable Windows build from the C-Dogs SDL project.",
  },
  "sven-co-op": {
    enabled: true,
    kind: "external",
    url: "steam://run/225840",
    steamAppId: "225840",
    versionLabel: "Steam",
    note: "Installs the free official Sven Co-op release through Steam.",
  },
  teeworlds: {
    enabled: true,
    kind: "github-zip",
    repo: "teeworlds/teeworlds",
    assetPattern: "teeworlds-.*-win64\\.zip$",
    exeHint: "teeworlds",
    versionLabel: "latest",
    note: "Official portable 64-bit Windows build.",
  },
  assaultcube: {
    enabled: true,
    kind: "github-installer",
    repo: "assaultcube/AC",
    assetPattern: "AssaultCube_.*\\.exe$",
    exeHint: "ac_client",
    registryTitles: ["AssaultCube"],
    knownExePaths: [
      "%PROGRAMFILES%\\AssaultCube\\bin_win32\\ac_client.exe",
      "%PROGRAMFILES(X86)%\\AssaultCube\\bin_win32\\ac_client.exe",
      "%LOCALAPPDATA%\\Programs\\AssaultCube\\bin_win32\\ac_client.exe",
    ],
    note: "Official AssaultCube Windows setup — finish the wizard, then Play.",
  },
  openclonk: {
    enabled: true,
    kind: "direct-installer",
    url: "https://www.openclonk.org/builds/release/8.1/openclonk-8.1-x64.exe",
    fileName: "openclonk-8.1-x64.exe",
    versionLabel: "8.1",
    exeHint: "openclonk",
    registryTitles: ["OpenClonk"],
    knownExePaths: [
      "%PROGRAMFILES%\\OpenClonk\\openclonk.exe",
      "%PROGRAMFILES(X86)%\\OpenClonk\\openclonk.exe",
      "%LOCALAPPDATA%\\Programs\\OpenClonk\\openclonk.exe",
    ],
    note: "Official OpenClonk 8.1 64-bit Windows setup.",
  },
  "red-eclipse": {
    enabled: true,
    kind: "github-installer",
    repo: "redeclipse/base",
    assetPattern: "redeclipse_.*_win\\.exe$",
    exeHint: "redeclipse",
    registryTitles: ["Red Eclipse"],
    knownExePaths: [
      "%PROGRAMFILES%\\Red Eclipse\\redeclipse.exe",
      "%PROGRAMFILES(X86)%\\Red Eclipse\\redeclipse.exe",
      "%LOCALAPPDATA%\\Programs\\Red Eclipse\\redeclipse.exe",
    ],
    note: "Official Red Eclipse Windows installer from the project release.",
  },
  widelands: {
    enabled: true,
    kind: "github-installer",
    repo: "widelands/widelands",
    assetPattern: "Widelands-.*-x64\\.exe$",
    exeHint: "widelands",
    registryTitles: ["Widelands"],
    knownExePaths: [
      "%PROGRAMFILES%\\Widelands\\widelands.exe",
      "%PROGRAMFILES(X86)%\\Widelands\\widelands.exe",
      "%LOCALAPPDATA%\\Programs\\Widelands\\widelands.exe",
    ],
    note: "Official current 64-bit Windows installer.",
  },
  warfork: {
    enabled: true,
    kind: "steamcmd",
    steamAppId: "1136510",
    versionLabel: "Anonymous SteamCMD",
    exeHint: "warfork_x64\\.exe$",
    note: "One-click official Warfork client install through its public anonymous depot. No Steam client or account required.",
  },
  "slapshot-rebound": {
    enabled: true,
    kind: "external",
    url: "steam://run/1173370",
    steamAppId: "1173370",
    versionLabel: "Steam",
    note: "Installs the free official Slapshot: Rebound release through Steam.",
  },
  openra: {
    enabled: true,
    kind: "github-zip",
    repo: "OpenRA/OpenRA",
    assetPattern: "x64-winportable\\.zip$",
    exeHint: "RedAlert|OpenRA",
    // OpenRA's join setting is Launch.Connect. Game.Mod is required so OpenRA
    // launches directly into the target mod (e.g. Red Alert) instead of modchooser.
    connectArgs: ["Game.Mod=ra", "Launch.Connect={host}:{port}"],
  },
  "endless-sky": {
    enabled: true,
    kind: "github-zip",
    repo: "endless-sky/endless-sky",
    assetPattern: "^EndlessSky-win64-.*\\.zip$",
    exeHint: "EndlessSky",
  },
  /*
   * What installs here is the SS14 launcher, not the game. Content is fetched
   * per server on first join and cached, because the server decides which build
   * you run — so there is no game version for us to pin or to auto-update
   * against, and the first connection is slower than later ones.
   */
  "space-station-14": {
    enabled: true,
    kind: "github-zip",
    repo: "space-wizards/SS14.Launcher",
    assetPattern: "^SS14\\.Launcher_Windows\\.zip$",
    exeHint: "SS14.Launcher",
    knownExePaths: ["SS14.Launcher.exe"],
    // Windows zip is framework-dependent (net10.0); Linux/mac ship their own runtime.
    needsDotNetMajor: 10,
  },
  "warzone-2100": {
    enabled: true,
    kind: "github-zip",
    repo: "Warzone2100/warzone2100",
    assetPattern: "win_x64_archive\\.zip$",
    exeHint: "warzone2100",
    connectArgs: ["--join={host}:{port}"],
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
    connectArgs: ["--connect-now={host}:{port}"],
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
    exeHint: "xonotic.*sdl|xonotic.*gl|xonotic.*x64|xonotic",
    connectArgs: ["+connect", "{host}:{port}"],
  },
  mindustry: {
    enabled: true,
    kind: "github-jar",
    repo: "Anuken/Mindustry",
    assetPattern: "^Mindustry\\.jar$",
    note: "Requires Java 17+ (Adoptium Temurin).",
    connectArgs: ["{host}:{port}"],
  },
  "battle-for-wesnoth": {
    enabled: true,
    kind: "direct-installer",
    url: "https://sourceforge.net/projects/wesnoth/files/wesnoth-1.18/wesnoth-1.18.7/wesnoth-1.18.7-win64.exe/download",
    urlMac: "https://downloads.sourceforge.net/project/wesnoth/wesnoth-1.18/wesnoth-1.18.7/Wesnoth_1.18.7.dmg",
    urlLinux: "https://downloads.sourceforge.net/project/wesnoth/wesnoth-1.18/wesnoth-1.18.7/wesnoth-1.18.7.tar.bz2",
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
    exeHint: "pyrogenesis",
    knownExePaths: [
      "%PROGRAMFILES%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%PROGRAMFILES(X86)%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%LOCALAPPDATA%\\Programs\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "%LOCALAPPDATA%\\0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "0 A.D. alpha\\binaries\\system\\pyrogenesis.exe",
      "binaries\\system\\pyrogenesis.exe",
      "pyrogenesis.exe",
    ],
    installRoot: "%PROGRAMFILES%\\0 A.D. alpha",
  },
  veloren: {
    enabled: true,
    kind: "direct-installer",
    url: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/windows-installer-x86_64",
    urlMac: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/macos-client-x86_64.zip",
    urlLinux: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/linux-client-x86_64.zip",
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
    connectArgs: ["-n", "{host}:{port}"],
  },
  "beyond-all-reason": {
    enabled: true,
    kind: "github-installer",
    repo: "beyond-all-reason/BYAR-Chobby",
    assetPattern: "Beyond-All-Reason-.*\\.exe$",
    note: "Opens the BAR launcher — click Update, then Start.",
    registryTitles: ["Beyond All Reason", "Beyond-All-Reason", "BYAR-Chobby"],
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond-All-Reason\\Beyond All Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond-All-Reason\\BeyondAllReason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond All Reason\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond All Reason\\Beyond All Reason.exe",
      "%LOCALAPPDATA%\\Programs\\Beyond All Reason\\BeyondAllReason.exe",
      "%LOCALAPPDATA%\\Programs\\BYAR-Chobby\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Programs\\BYAR-Chobby\\Beyond All Reason.exe",
      "%LOCALAPPDATA%\\Programs\\BYAR-Chobby\\BeyondAllReason.exe",
      "%LOCALAPPDATA%\\Programs\\BeyondAllReason\\BeyondAllReason.exe",
      "%LOCALAPPDATA%\\BYAR-Chobby\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%LOCALAPPDATA%\\Beyond All Reason\\Beyond All Reason.exe",
      "%PROGRAMFILES%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%PROGRAMFILES%\\Beyond All Reason\\Beyond All Reason.exe",
      "%PROGRAMFILES%\\Beyond All Reason\\BeyondAllReason.exe",
      "%PROGRAMFILES(X86)%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
      "%PROGRAMFILES(X86)%\\Beyond All Reason\\Beyond All Reason.exe",
      "%PROGRAMFILES(X86)%\\Beyond All Reason\\BeyondAllReason.exe",
      "%APPDATA%\\Beyond-All-Reason\\Beyond-All-Reason.exe",
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
    urlMac: "https://www.hedgewars.org/download/releases/Hedgewars-1.0.0.dmg",
    // CPack NSIS uses CPACK_PACKAGE_INSTALL_DIRECTORY "Hedgewars ${version}"
    knownExePaths: [
      "%PROGRAMFILES%\\Hedgewars 1.0.0\\hedgewars.exe",
      "%PROGRAMFILES%\\Hedgewars 1.0.0\\bin\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Hedgewars 1.0.0\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Hedgewars 1.0.0\\bin\\hedgewars.exe",
      "%LOCALAPPDATA%\\Programs\\Hedgewars 1.0.0\\hedgewars.exe",
      "%LOCALAPPDATA%\\Programs\\Hedgewars 1.0.0\\bin\\hedgewars.exe",
      "%LOCALAPPDATA%\\Programs\\Hedgewars\\hedgewars.exe",
      "%LOCALAPPDATA%\\Programs\\Hedgewars\\bin\\hedgewars.exe",
      "%PROGRAMFILES%\\Hedgewars\\hedgewars.exe",
      "%PROGRAMFILES%\\Hedgewars\\bin\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Hedgewars\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Hedgewars\\bin\\hedgewars.exe",
      "%PROGRAMFILES%\\hedgewars\\hedgewars.exe",
      "%USERPROFILE%\\Hedgewars\\hedgewars.exe",
      "%USERPROFILE%\\Hedgewars\\bin\\hedgewars.exe",
      "C:\\Hedgewars 1.0.0\\hedgewars.exe",
      "C:\\Hedgewars 1.0.0\\bin\\hedgewars.exe",
      "C:\\Hedgewars\\hedgewars.exe",
      "C:\\Hedgewars\\bin\\hedgewars.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Hedgewars\\hedgewars.exe",
    ],
    registryTitles: ["Hedgewars", "Hedgewars 1.0.0"],
    exeHint: "hedgewars",
    /*
     * Hedgewars has no --connect: the 1.0.0 frontend's long options are
     * --nick/--port/--fullscreen/… with nothing to name a server, so this
     * previously said `["--connect", "{host}:{port}"]` and could never have
     * worked. Joining is a positional hwplay:// URL instead —
     * "hwplay://<HOST>[:<PORT>]", per the project's HWPlaySchemeSyntax page,
     * defaulting to 46631, which is the port the adapter hosts on.
     */
    connectArgs: ["hwplay://{host}:{port}"],
  },
  unvanquished: {
    enabled: true,
    kind: "github-zip",
    repo: "Unvanquished/updater",
    assetPattern: "UnvUpdaterWin\\.zip$",
    exeHint: "daemon|unvanquished|UnvanquishedUpdater|updater",
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
    // Keep in sync with FREECIV_VERSION in platform/game-host/install.sh — party
    // hosting rejects clients when the VPS apt server is older than this build.
    url: "https://files.freeciv.org/packages/windows/Freeciv-3.2.5-msys2-win64-10-gtk4-setup.exe",
    urlMac: "https://files.freeciv.org/packages/macos/freeciv-3.1.0-beta1-MacOS.tar.gz",
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
    connectArgs: ["--autoconnect", "--server", "{host}", "--port", "{port}"],
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
    urlMac: "https://download.flightgear.org/release-2024.1/flightgear-2024.1.6-macos-universal.dmg",
    urlLinux: "https://download.flightgear.org/release-2024.1/flightgear-2024.1.6-linux-amd64.AppImage",
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
    kind: "direct-zip",
    url: "https://zandronum.com/downloads/zandronum3.2.1-win64-base.zip",
    fileName: "zandronum3.2.1-win64-base.zip",
    exeHint: "zandronum",
    overlayUrl: "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
    overlayFileName: "freedoom-0.13.0.zip",
    connectArgs: ["+connect", "{host}:{port}"],
    knownExePaths: [
      "%LOCALAPPDATA%\\Zandronum\\zandronum.exe",
      "%PROGRAMFILES%\\Zandronum\\zandronum.exe",
      "%PROGRAMFILES(X86)%\\Zandronum\\zandronum.exe",
      "~/PlayBound/Games/freedoom/zandronum/zandronum.exe",
      "~/PlayBound/Games/freedoom/zandronum.exe",
    ],
    note: "Bundles the Zandronum multiplayer source port with Freedoom Phase 1 & 2 IWADs for one-click play.",
  },
  freelancer: {
    /*
     * Owner-supplied, exactly like the EverQuest Titanium editions.
     *
     * Freelancer is still Microsoft's copyright and was never released as
     * freeware, so PlayBound never ships it — this used to point at a rip of
     * the 2003 retail CD on archive.org, which was both dead and not ours to
     * distribute. requiresBaseDir makes the launcher ask the player for their
     * own install first; everything PlayBound adds goes on top of that copy.
     */
    enabled: true,
    kind: "locate-then-zip",
    requiresBaseDir: true,
    exeHint: "Freelancer|FL",
    knownExePaths: [
      "%PROGRAMFILES%\\Microsoft Games\\Freelancer\\EXE\\Freelancer.exe",
      "%PROGRAMFILES(X86)%\\Microsoft Games\\Freelancer\\EXE\\Freelancer.exe",
      "%LOCALAPPDATA%\\Programs\\Freelancer\\EXE\\Freelancer.exe",
      "%USERPROFILE%\\Games\\Freelancer\\EXE\\Freelancer.exe",
    ],
    note: "Requires your own copy of Freelancer. PlayBound never ships the game — it locates your install and applies the community patches on top.",
  },
  "privateer-gemini-gold": {
    enabled: true,
    // The project publishes its own Windows installer on SourceForge; verified
    // 321 MB and serving 200 to the launcher's user agent.
    kind: "direct-installer",
    url: "https://downloads.sourceforge.net/project/privateer/Wing%20Commander%20Privateer/Privateer%20Gemini%20Gold%201.03/PrivateerGold1.03.exe",
    fileName: "PrivateerGold1.03.exe",
    versionLabel: "1.03",
    exeHint: "privateer|vegastrike",
    registryTitles: ["Privateer Gemini Gold", "Privateer"],
    knownExePaths: [
      "%PROGRAMFILES%\\Privateer Gemini Gold\\privateer.exe",
      "%PROGRAMFILES(X86)%\\Privateer Gemini Gold\\privateer.exe",
      "%LOCALAPPDATA%\\Programs\\Privateer Gemini Gold\\privateer.exe",
    ],
    note: "Opens the official Privateer Gemini Gold setup — finish the wizard, then Play.",
  },
  "ur-quan-masters": {
    enabled: true,
    // Upstream never published a 0.8.0 zip — the 0.8 directory ships a win32
    // *installer*, so both the filename and the kind were wrong and the
    // download 404'd. Verified against the SourceForge 0.8 file listing.
    kind: "direct-installer",
    url: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-win32.exe",
    urlMac: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-macos.dmg",
    fileName: "uqm-0.8-win32.exe",
    exeHint: "uqm",
    overlayUrl: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8.0-content.uqm",
    overlayFileName: "uqm-0.8.0-content.uqm",
    knownExePaths: [
      "%PROGRAMFILES%\\The Ur-Quan Masters\\uqm.exe",
      "%PROGRAMFILES(X86)%\\The Ur-Quan Masters\\uqm.exe",
      "%LOCALAPPDATA%\\Programs\\The Ur-Quan Masters\\uqm.exe",
      "%USERPROFILE%\\Games\\UQM\\uqm.exe",
    ],
    note: "Official open-source port of Star Control II with full game content.",
  },
  airforce: {
    /*
     * DISABLED — allegro.cc is gone, not just this file. The whole host fails
     * to resolve, so the attachment this pointed at cannot be recovered from
     * it, and there is no other publisher: AirForce was distributed solely
     * through that community's attachment system.
     *
     * Left in place rather than deleted so the game keeps its catalog entry
     * and this note explains why it cannot be installed. Re-enable only
     * against a source that actually serves the file.
     */
    enabled: false,
    kind: "direct-zip",
    url: "https://www.allegro.cc/files/attachment/593457",
    fileName: "AirForce_Executable_1.0.0.0.zip",
    exeHint: "AirForce",
    note: "Classic 1942-style vertical shoot 'em up built with Allegro.",
  },
  bzflag: {
    enabled: true,
    // BZFlag tags releases on GitHub but attaches no binaries to them, so the
    // asset pattern could never match. Windows builds are published on their
    // own download host instead.
    kind: "direct-installer",
    url: "https://download.bzflag.org/bzflag/windows/2.4.30/bzflag-2.4.30.exe",
    urlMac: "https://download.bzflag.org/bzflag/macos/2.4.30/BZFlag-2.4.30-macOS.zip",
    fileName: "bzflag-2.4.30.exe",
    versionLabel: "2.4.30",
    exeHint: "bzflag",
    knownExePaths: [
      "%PROGRAMFILES%\\BZFlag\\bzflag.exe",
      "%PROGRAMFILES(X86)%\\BZFlag\\bzflag.exe",
      "%LOCALAPPDATA%\\Programs\\BZFlag\\bzflag.exe",
    ],
    connectArgs: ["-e", "{host}:{port}"],
    note: "3D multiplayer tank battle game with capture the flag.",
  },
  "beneath-a-steel-sky": {
    enabled: true,
    kind: "direct-zip",
    url: "https://downloads.scummvm.org/frs/extras/Beneath%20a%20Steel%20Sky/bass-cd-1.2.zip",
    fileName: "bass-cd-1.2.zip",
    exeHint: "scummvm|sky",
    knownExePaths: [
      "%PROGRAMFILES%\\GOG Galaxy\\Games\\Beneath a Steel Sky\\scummvm.exe",
      "%PROGRAMFILES(X86)%\\GOG Galaxy\\Games\\Beneath a Steel Sky\\scummvm.exe",
      "%PROGRAMFILES%\\Beneath a Steel Sky\\scummvm.exe",
      "%PROGRAMFILES(X86)%\\Beneath a Steel Sky\\scummvm.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\Beneath a Steel Sky\\scummvm.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Beneath a Steel Sky\\scummvm.exe",
    ],
    note: "Official freeware release of the complete CD Talkie version by Revolution Software.",
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
    // ECWolf tags versions but publishes no GitHub releases at all, so this
    // recipe could never resolve. Builds come from the project's own site.
    kind: "direct-zip",
    url: "https://maniacsvault.net/ecwolf/files/ecwolf/1.x/ecwolf-1.4.2_x64.zip",
    fileName: "ecwolf-1.4.2_x64.zip",
    versionLabel: "1.4.2",
    /*
     * The shareware episode, so Install produces a playable game rather than
     * an engine with nothing to run.
     *
     * ECWolf ships no game data, and this recipe used to say to add it
     * "separately" — which left the player with ecwolf.exe and no way in.
     * Apogee's 1992 shareware release is freely redistributable and ECWolf
     * carries a first-class definition for it: iwadinfo.txt declares
     * "Wolfenstein 3D Shareware" (Autoname Wolf.Wolf3D.Shareware), detected by
     * the BJPIC and VISACARD lumps these files supply.
     *
     * Curated to the eight files the engine reads. The original archive also
     * holds the DOS WOLF3D.EXE, which is not the engine we launch, and a saved
     * CONFIG.WL1 that would overwrite the player's own settings.
     *
     * No overlayDest: the ECWolf zip is flat, so the data belongs in the game
     * root beside ecwolf.exe and ecwolf.pk3.
     */
    overlayUrl:
      "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher-packages/games/wolfenstein/wolf3d-shareware-data.zip",
    overlayFileName: "wolf3d-shareware-data.zip",
    note: "ECWolf with the freely redistributable Wolfenstein 3D shareware episode — one install, ready to play.",
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
    kind: "direct-installer",
    url: "https://sg-hyp-public.hoyoverse.com/hyp/hyp-prod/pkg/installer/HYP_1.0.0.0_Setup.exe",
    fileName: "HYP_Genshin_Setup.exe",
    registryTitles: ["Genshin Impact", "HoYoPlay", "miHoYo Launcher"],
    knownExePaths: [
      "%PROGRAMFILES%\\Genshin Impact\\Genshin Impact Game\\GenshinImpact.exe",
      "%PROGRAMFILES%\\HoYoPlay\\launcher.exe",
      "%PROGRAMFILES(X86)%\\Genshin Impact\\launcher.exe",
      "C:\\Program Files\\Genshin Impact\\Genshin Impact Game\\GenshinImpact.exe",
      "C:\\Program Files\\HoYoPlay\\launcher.exe",
    ],
    exeHint: "GenshinImpact|HoYoPlay",
    note: "Official HoYoPlay standalone PC client from HoYoverse.",
  },
  "dota-2": {
    enabled: true,
    kind: "external",
    url: "https://store.steampowered.com/app/570/Dota_2/",
    registryTitles: ["Dota 2"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\dota 2 beta\\game\\bin\\win64\\dota2.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\dota 2 beta\\game\\bin\\win64\\dota2.exe",
    ],
    exeHint: "dota2|dota",
    note: "Free on Steam (App ID 570). Launches through Steam client.",
  },
  "league-of-legends": {
    enabled: true,
    kind: "direct-installer",
    url: "https://lol.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.na.exe",
    fileName: "Install-League-of-Legends-NA.exe",
    registryTitles: ["League of Legends", "Riot Client"],
    knownExePaths: [
      "C:\\Riot Games\\League of Legends\\LeagueClient.exe",
      "C:\\Riot Games\\Riot Client\\RiotClientServices.exe",
      "%PROGRAMFILES%\\Riot Games\\League of Legends\\LeagueClient.exe",
    ],
    exeHint: "LeagueClient|RiotClient",
    note: "Official Riot standalone installer for League of Legends and Riot Client.",
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
    registryTitles: ["Quake Champions"],
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\quakechampions\\client\\bin\\pc\\QuakeChampions.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\quakechampions\\client\\bin\\pc\\QuakeChampions.exe",
    ],
    exeHint: "QuakeChampions|quake",
    note: "Free on Steam (App ID 611500). Launches through Steam client.",
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
    steamAppId: "1815780",
    exeHint: "asphalt",
    knownExePaths: [
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Asphalt Legends\\AsphaltLegends.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Asphalt Legends Unite\\AsphaltLegendsUnite.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\Asphalt 9\\Asphalt9_wgp.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\Asphalt Legends\\AsphaltLegends.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\Asphalt Legends Unite\\AsphaltLegendsUnite.exe",
      "%PROGRAMFILES%\\Steam\\steamapps\\common\\Asphalt 9\\Asphalt9_wgp.exe",
      "Asphalt Legends\\AsphaltLegends.exe",
      "Asphalt Legends Unite\\AsphaltLegendsUnite.exe",
      "Asphalt 9\\Asphalt9_wgp.exe",
      "AsphaltLegends.exe",
      "AsphaltLegendsUnite.exe",
      "Asphalt9_wgp.exe",
    ],
    note: "Free on Steam (and Epic). Live-service client — always-online.",
  },

  "asherons-call": {
    enabled: true,
    kind: "direct-installer",
    url: "https://github.com/torreyd/ThwargLauncher/releases/download/v3.4.1.0/ThwargLauncherInstaller.exe",
    fileName: "ThwargLauncherInstaller.exe",
    versionLabel: "v3.4.1",
    exeHint: "thwarg|acclient",
    knownExePaths: [
      "%LOCALAPPDATA%\\Programs\\ThwargLauncher\\ThwargLauncher.exe",
      "%PROGRAMFILES(X86)%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
      "%PROGRAMFILES%\\Thwargle Games\\ThwargLauncher\\ThwargLauncher.exe",
      "%LOCALAPPDATA%\\ThwargLauncher\\ThwargLauncher.exe",
      "%PROGRAMFILES(X86)%\\Turbine\\Asheron's Call\\acclient.exe",
      "%PROGRAMFILES%\\Turbine\\Asheron's Call\\acclient.exe",
      "%LOCALAPPDATA%\\Turbine\\Asheron's Call\\acclient.exe",
      "ThwargLauncher.exe",
      "acclient.exe",
    ],
    note: "Installs ThwargLauncher, the universal launcher and server connector for Asheron's Call ACE servers.",
  },

  "tinywind-pixel-pirate-sailing-game": {
    enabled: true,
    kind: "external",
    url: "https://tinywind.io",
    note: "Plays in the browser. No PlayBound desktop installer yet.",
  },

  "marathon-2": {
    enabled: true,
    kind: "github-zip",
    repo: "Aleph-One-Marathon/alephone",
    assetPattern: "^Marathon2-\\d{8}-Win\\.zip$",
    exeHint: "Marathon2.exe",
    versionLabel: "Aleph One 1.6",
    note: "Bundles the Aleph One engine and complete Marathon 2 scenario.",
  },

  marathon: {
    enabled: true,
    kind: "github-zip",
    repo: "Aleph-One-Marathon/alephone",
    assetPattern: "^Marathon-\\d{8}-Win\\.zip$",
    exeHint: "Marathon.exe",
    versionLabel: "Aleph One 1.6",
    note: "Bundles the Aleph One engine and complete Marathon scenario.",
  },

  alephone: {
    enabled: true,
    kind: "github-zip",
    repo: "Aleph-One-Marathon/alephone",
    assetPattern: "^Marathon2-\\d{8}-Win\\.zip$",
    exeHint: "Marathon2.exe",
    versionLabel: "Aleph One 1.6",
    note: "Bundles the Aleph One engine and complete Marathon scenarios.",
  },

  "mega-man-unlimited": {
    enabled: true,
    /*
     * One click rather than a hand-off to the creator's page. The zip is
     * linked directly from that page and served by the creator's own host, so
     * PlayBound still hosts nothing — it just follows the same link the player
     * would have clicked. Verified: 200, application/zip, ~97.6 MB.
     */
    kind: "direct-zip",
    url: "https://megaphilx.com/Game/MegaManUnlimitedV131.zip",
    fileName: "MegaManUnlimitedV131.zip",
    versionLabel: "1.3.1",
    // Archive contains a single "MegaMan Unlimited/" folder holding MMU.exe.
    exeHint: "MMU",
    installRoot: "MegaMan Unlimited",
    note: "Unofficial fangame, downloaded straight from the creator’s site — PlayBound does not host the zip.",
  },

  holocure: {
    enabled: true,
    kind: "direct-zip",
    url: "https://mirror.playbound.club/launcher-packages/games/holocure/1787200318272-HoloCure.zip",
    fileName: "HoloCure.zip",
    versionLabel: "0.7.1 (latest)",
    exeHint: "HoloCure|holocure",
    knownExePaths: [
      "%LOCALAPPDATA%\\HoloCure\\HoloCure.exe",
      "%PROGRAMFILES%\\HoloCure\\HoloCure.exe",
      "%PROGRAMFILES(X86)%\\Steam\\steamapps\\common\\HoloCure\\HoloCure.exe",
      "~/PlayBound/Games/holocure/HoloCure.exe",
      "~/.local/share/HoloCure/HoloCure.exe",
      "~/.steam/steam/steamapps/common/HoloCure/HoloCure.exe",
    ],
    note: "Downloads and extracts the official standalone HoloCure build. Runs on Windows and Linux (via Wine/Proton/Steam Deck).",
  },

  daggerfall: {
    enabled: true,
    kind: "direct-zip",
    url: "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/DFInstall.zip",
    fileName: "DFInstall.zip",
    versionLabel: "1.0 (Bethesda freeware release)",
    exeHint: "FALL.EXE",
    knownExePaths: [
      "DFCD/DAGGER/FALL.EXE",
      "DAGGER/FALL.EXE",
      "FALL.EXE",
    ],
    launchArgs: ["Z.CFG"],
    needsDosBox: true,
    note: "Bethesda's freeware Classic DOS release, configured automatically and launched through PlayBound-managed DOSBox Staging. Daggerfall Unity is available as its own edition.",
  },

  "tes-arena": {
    enabled: true,
    kind: "direct-zip",
    url: ARENA_GAMEFILES_URL,
    fileName: ARENA_GAMEFILES_FILE,
    versionLabel: "1.06 (Bethesda freeware release)",
    exeHint: TES_ARENA_EXE_HINT,
    knownExePaths: [...TES_ARENA_KNOWN_EXE_PATHS],
    needsDosBox: true,
    note: "Bethesda's official freeware release. OpenTESArena is a separate edition and overlays these files into data/ARENA.",
  },

  "star-wars-galaxies": {
    enabled: true,
    kind: "external",
    // The project moved to swgr.org; swgrestoration.com no longer resolves at
    // all (no DNS, not a 404). Still actively developed — content updates
    // through 2026 — and their installer fetches the game client itself, so a
    // hand-off is the right shape here.
    url: "https://swgr.org/play/",
    exeHint: "SWGR|swg",
    knownExePaths: [
      "%LOCALAPPDATA%\\SWG Restoration\\SWGRestoration.exe",
      "%PROGRAMFILES%\\SWG Restoration\\SWGRestoration.exe",
      "~/PlayBound/Games/star-wars-galaxies/SWGRestoration.exe",
    ],
    note: "Star Wars Galaxies restoration MMO client with Windows and Linux launcher support.",
  },

  pixreveal: {
    enabled: true,
    kind: "external",
    url: "https://pixreveal.com",
    note: "Play directly in any web browser without installation.",
  },

  "gamebuddies-io": {
    enabled: true,
    kind: "external",
    url: "https://gamebuddies.io",
    note: "Play directly in any web browser without installation.",
  },

  "hurry-curry": {
    enabled: true,
    kind: "direct-exe",
    url: "https://hurrycurry-download.metamuffin.org/client-x86_64-pc-windows-gnu.exe",
    fileName: "hurrycurry-client.exe",
    versionLabel: "v3.1.1",
    note: "Portable 64-bit Windows client. Also playable instantly in the browser.",
  },
  "gradius-remake": {
    enabled: true,
    kind: "direct-zip",
    url: "https://archive.org/download/gradius-remake-pc/GradiusRemake.zip",
    fileName: "GradiusRemake.zip",
    exeHint: "Gradius|Nemesis",
    versionLabel: "v1.2",
    note: "Standalone portable arcade shoot 'em up package with full gamepad and scanline options.",
  },
  "metal-slug-remake": {
    enabled: true,
    kind: "direct-zip",
    url: "https://archive.org/download/metal-slug-remake-pc/MetalSlugRemake.zip",
    fileName: "MetalSlugRemake.zip",
    exeHint: "MetalSlug",
    versionLabel: "v1.0",
    note: "Standalone portable arcade run-and-gun package with full controller mapping.",
  },
  bombsquad: {
    enabled: true,
    kind: "direct-zip",
    url: "https://files.ballistica.net/bombsquad/builds/BombSquad_Windows_1.8.0a103.zip",
    fileName: "BombSquad_Windows.zip",
    exeHint: "BombSquad",
    versionLabel: "1.8.0",
    note: "Official BombSquad Windows standalone package with full gamepad and LAN party support.",
  },
  "re-volt-rvgl": {
    enabled: true,
    kind: "direct-zip",
    url: "https://distribute.re-volt.io/releases/rvgl_full_win64_original.zip",
    urlMac: "https://distribute.re-volt.io/releases/rvgl_full_macos_original.dmg",
    urlLinux: "https://distribute.re-volt.io/releases/rvgl_full_linux_original.zip",
    fileName: "rvgl_full_win64_original.zip",
    exeHint: "rvgl",
    versionLabel: "v23.1030a",
    connectArgs: ["-lobby", "{host}:{port}"],
    note: "Complete standalone Re-Volt (RVGL) 64-bit Windows release with original soundtrack and Dreamcast content.",
  },
  openhv: {
    enabled: true,
    kind: "github-zip",
    repo: "OpenHV/OpenHV",
    assetPattern: "x64-winportable\\.zip$",
    url: "https://github.com/OpenHV/OpenHV/releases/download/20250725/OpenHV-20250725-x64-winportable.zip",
    fileName: "OpenHV-x64-winportable.zip",
    exeHint: "OpenHV",
    versionLabel: "20250725",
    note: "Official OpenHV portable 64-bit Windows release.",
  },
  srb2: {
    enabled: true,
    kind: "direct-zip",
    url: "https://github.com/STJr/SRB2/releases/download/SRB2_release_2.2.13/SRB2-v2213-Full.zip",
    urlMac: "https://github.com/STJr/SRB2/releases/download/SRB2_release_2.2.13/SRB2-2.2.13-macOS-Installer.dmg",
    fileName: "SRB2-v2213-Full.zip",
    exeHint: "srb2win",
    versionLabel: "2.2.13",
    note: "Official 3D Sonic platformer built on a modified Doom engine.",
  },
};
