/**
 * FreeTrain catalog patch source — Mongo-only title (not in games.ts).
 * Field-scoped writes go through insert-catalog-wave PATCH_GAME_FIELDS.
 *
 * PlayBound installs dgVoodoo2 MS/x86 DLLs beside FreeTrain.exe and registers
 * CLSID_DirectDraw under HKCU so CoCreateInstance succeeds without admin.
 */
export const FREETRAIN_SLUG = "freetrain" as const;

export const freetrainLauncherInstall = {
  enabled: true,
  kind: "direct-zip" as const,
  url: "https://mirror.playbound.club/games/freetrain/20070604/freetrain-windows-32bit.zip",
  fileName: "freetrain-windows-32bit.zip",
  exeHint: "FreeTrain",
  knownExePaths: ["FreeTrain.exe"],
  needsDirectDrawWrapper: true,
  versionLabel: "2007-06-04",
  note:
    "PlayBound installs a DirectDraw compatibility layer (dgVoodoo2) automatically so FreeTrain can start on modern Windows.",
};

export const freetrainSystemRequirements = {
  min: "Pentium III / 500 MHz · 128 MB RAM · DirectDraw-capable GPU · 50 MB storage",
  recommended: "1 GHz CPU · 256 MB RAM · Any DirectX 9+ GPU · 100 MB storage",
} as const;

export const freetrainHardwareRequirements = {
  min: {
    ramMB: 128,
    storageMB: 50,
    apis: ["directx"],
    cpuText: "Pentium III / 500 MHz",
    gpuText: "DirectDraw-capable GPU",
    notes: "32-bit Windows client. PlayBound supplies a DirectDraw wrapper on install.",
  },
  recommended: {
    ramMB: 256,
    storageMB: 100,
    apis: ["directx"],
    cpuText: "1 GHz CPU",
    gpuText: "Any DirectX 9 or newer GPU",
  },
  provenance: {
    source: "playbound_verified" as const,
    enteredBy: "admin" as const,
  },
};

export const freetrainEditorial = {
  qualityBar: {
    genuinelyFree: true,
    finished: true,
    activelyMaintained: false,
    standsAlone: true,
    highQuality: true,
    verdict:
      "FreeTrain clears the PlayBound Bar as a finished freeware city-builder whose rail networks still feel like toys you assemble by hand, not menus you optimize.",
    lastVerified: "2026-09-11",
  },
  longDescription:
    "FreeTrain is a Japanese freeware city-builder from the mid-2000s where the joy is laying track, timing trains, and watching a skyline grow around the stations you chose. You place residential, commercial, and industrial zones the way early SimCity taught a generation to think, then bind them together with rail that has to make sense on the map — curves, grades, and junctions matter more than a spreadsheet.\n\nThe presentation is deliberately light: isometric tiles, cheerful vehicles, and a construction mode that invites tinkering rather than min-maxing. Scenarios and free-build maps give different starting problems, but the constant pleasure is the same — a line that finally connects, a timetable that stops bottlenecking, a neighborhood that fills because the train actually arrives.\n\nThe preserved Windows build is from 2007 and still speaks DirectDraw. Modern PCs often refuse that COM class outright. PlayBound installs a local DirectDraw compatibility layer beside FreeTrain.exe and registers it for your user account, so Play is meant to open the game rather than a stack dump about CLSID {E1211353…}.",
  whyWePickedIt:
    "We picked FreeTrain because it is a complete, no-strings freeware rail city-builder that still teaches spatial systems better than most modern free-to-play builders. PlayBound's job is the unglamorous part: making the 2007 client start on Windows that forgot DirectDraw existed.",
  thatOneThing:
    "The moment a new residential block fills because your last spur finally hits the commercial strip on time.",
  bestFor: [
    "Players who liked classic SimCity-style zoning with trains as the spine",
    "Anyone who wants a finished freeware builder without accounts or shops",
    "Tinkerers who enjoy watching schedules and junctions rather than combat",
  ],
  notFor: [
    "Players who need an actively maintained modern engine",
    "Anyone looking for multiplayer or online progression",
    "People who want controller-first or console-style UI",
  ],
  comparableTo: ["SimCity 2000", "OpenTTD", "Chris Sawyer's Locomotion", "A-Train"],
  installSteps: [
    {
      platform: "windows" as const,
      text: "Choose Install in PlayBound. We download the preserved 32-bit FreeTrain package from our mirror.",
    },
    {
      platform: "windows" as const,
      text: "PlayBound places a DirectDraw compatibility layer (dgVoodoo2) next to FreeTrain.exe and registers it for your Windows user — no separate DirectX installer step.",
    },
    {
      platform: "windows" as const,
      text: "Press Play. If Windows Defender quarantines a wrapper DLL, restore it from Protection history and try again.",
    },
  ],
  faq: [
    {
      q: "Is FreeTrain free?",
      a: "Yes. It is freeware. PlayBound hosts a preserved Windows package; there is no shop, account gate, or microtransaction layer.",
    },
    {
      q: "Why did Play used to crash with a DirectDraw / CLSID error?",
      a: "FreeTrain creates classic DirectDraw through COM. Many modern Windows installs no longer expose that class. PlayBound installs dgVoodoo2's DirectDraw DLLs beside the game and registers the COM class for your user so CoCreateInstance succeeds.",
    },
    {
      q: "Do I need to install DirectX End-User Runtime myself?",
      a: "Usually no. The wrapper is meant to be enough. If Play still fails after a fresh install, install Microsoft's DirectX End-User Runtimes (June 2010) and enable Legacy Components → DirectPlay, then try again.",
    },
    {
      q: "Is there a Mac or Linux build?",
      a: "Not in this PlayBound listing. The preserved client is the 32-bit Windows build. Community SDL/Mono experiments existed historically but are not what we ship.",
    },
    {
      q: "Does it support controllers?",
      a: "No. FreeTrain is a mouse-and-keyboard builder.",
    },
  ],
};
