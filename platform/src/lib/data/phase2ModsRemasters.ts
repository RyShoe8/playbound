/**
 * Phase 2 remaster / FOSS catch-up mods (~16–18 per base).
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";
import type { InstallStep } from "./types";

type Def = {
  slug: string;
  title: string;
  tagline: string;
  desc: string;
  base: string;
  baseTitle: string;
  path: string;
  website: string;
  repo?: string;
  kind?: "github-zip" | "direct-zip" | "external";
  pattern?: string;
  direct?: string;
  size?: number;
  year?: number;
  license?: string;
  changes: string;
  summary: string;
  hint?: string;
  compat?: string;
  platforms?: ("Windows" | "macOS" | "Linux")[];
  steps?: InstallStep[];
};

function m(d: Def): ModSeed {
  const kind = d.kind ?? (d.repo ? "github-zip" : d.direct ? "direct-zip" : "external");
  return ghMod({
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    description: d.desc,
    baseGameSlug: d.base,
    baseTitle: d.baseTitle,
    developerSlug: "indie-web",
    license: d.license ?? "Community / External hub",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 40,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: kind === "github-zip" ? d.pattern ?? "\\.zip$" : null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    art: { from: "#1e293b", to: "#64748b", icon: "Package" },
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    compatibility: d.compat,
    platforms: d.platforms,
    installSteps: d.steps,
  });
}

const FG_COMPAT = "FlightGear 2024.1+ addon module (`--addon`)";
const FG_STEPS: InstallStep[] = [
  {
    platform: "all",
    text: "Install with PlayBound. The archive is unzipped into FlightGear's Addons folder (FG_HOME), not the game bin directory.",
  },
  {
    platform: "all",
    text: "Play FlightGear from PlayBound. The launcher passes --addon for each installed add-on module that still has addon-main.nas.",
  },
];
const FG_HINT =
  "PlayBound unzips the add-on into FlightGear's Addons folder, then Play FlightGear — PlayBound passes --addon for each installed module.";

function fgAddon(
  d: Omit<Def, "base" | "baseTitle" | "path" | "compat" | "steps"> & { extraHint?: string }
): ModSeed {
  const { extraHint, ...rest } = d;
  return m({
    ...rest,
    base: "flightgear",
    baseTitle: "FlightGear",
    path: "",
    license: rest.license ?? "GPL / FlightGear add-on",
    compat: FG_COMPAT,
    hint: extraHint ? `${FG_HINT} ${extraHint}` : FG_HINT,
    steps: FG_STEPS,
  });
}

const freecivMods: ModSeed[] = [
  m({ slug: 'freeciv-civ2civ3-earth', title: 'Civ2Civ3 Earth', tagline: 'Earth-tuned Civ2Civ3 ruleset.', desc: 'Fork of civ2civ3 optimized for Earth maps with amplio_earth tiles.', base: 'freeciv', baseTitle: 'Freeciv', path: 'data', website: 'https://github.com/dftec-es/civ2civ3_earth', repo: 'dftec-es/civ2civ3_earth', size: 80, changes: 'Earth map balance and tilesets.', summary: 'Earth-tuned Civ2Civ3 ruleset pack.' }),
  m({ slug: 'freeciv-ampliolt', title: 'AmplioLT tileset', tagline: 'Longturn-tuned Amplio tiles.', desc: 'Isosquare tileset tweaks popular on Longturn.net.', base: 'freeciv', baseTitle: 'Freeciv', path: 'data', website: 'https://github.com/daavko/amplioLT', repo: 'daavko/amplioLT', size: 60, changes: 'Clearer units and HP bars.', summary: 'Amplio variant for Longturn play.' }),
];

const flightgearMods: ModSeed[] = [
  m({
    slug: "flightgear-c172p",
    title: "Cessna 172P",
    tagline: "Detailed C172 training aircraft.",
    desc: "Detailed C172 training aircraft.",
    base: "flightgear",
    baseTitle: "FlightGear",
    path: "Aircraft",
    website: "https://github.com/c172p-team/c172p",
    repo: "c172p-team/c172p",
    changes: "Training workhorse.",
    summary: "Detailed C172 training aircraft.",
  }),
  fgAddon({
    slug: "flightgear-addon-logbook",
    title: "Logbook",
    tagline: "Log every FlightGear flight to a local file.",
    desc: "FlightGear add-on that records flights and offers in-sim analysis.",
    website: "https://github.com/PlayeRom/flightgear-addon-logbook",
    repo: "PlayeRom/flightgear-addon-logbook",
    size: 8,
    changes: "Persists a local logbook with flight analysis from the add-on menu.",
    summary:
      "Logs takeoffs, landings, and time in type so you can review sessions without leaving the sim.",
  }),
  fgAddon({
    slug: "flightgear-addon-aerotow-everywhere",
    title: "Aerotow Everywhere",
    tagline: "AI tow planes at every airport.",
    desc: "Add-on that provides AI aerotow for gliders at any airport.",
    website: "https://github.com/PlayeRom/flightgear-addon-aerotow-everywhere",
    repo: "PlayeRom/flightgear-addon-aerotow-everywhere",
    size: 20,
    changes: "Spawns AI tow aircraft so gliders can launch from airports that ship without a tow scenario.",
    summary: "Puts an aerotow service at every airport instead of only a handful of bundled scenarios.",
    extraHint:
      "After the first run, add --data= pointing at $FG_HOME/Export/Addons/org.flightgear.addons.aerotoweverywhere (or the path printed in fgfs.log) so AI models load.",
  }),
  fgAddon({
    slug: "flightgear-addon-which-runway",
    title: "Which Runway",
    tagline: "Best runway from wind and airport prefs.",
    desc: "Dynamically picks takeoff and landing runways from wind and airport preferences.",
    website: "https://github.com/PlayeRom/flightgear-addon-which-runway",
    repo: "PlayeRom/flightgear-addon-which-runway",
    size: 6,
    changes: "Shows preferred runway plus headwind, crosswind, and tailwind components.",
    summary: "Answers which runway to use right now instead of guessing from the METAR alone.",
  }),
  fgAddon({
    slug: "flightgear-addon-fgcamera",
    title: "FGCamera",
    tagline: "Virtual camera views and head motion.",
    desc: "FGCamera add-on: custom views, look-at, zoom, and random head movement.",
    website: "https://github.com/PlayeRom/flightgear-addon-fgcamera",
    repo: "PlayeRom/flightgear-addon-fgcamera",
    size: 12,
    changes: "Adds numbered camera presets and optional dynamic/random head movement.",
    summary: "Gives FlightGear an Ezdok-style camera pack without editing each aircraft by hand.",
  }),
  fgAddon({
    slug: "flightgear-addon-rcview",
    title: "RCView",
    tagline: "Radio-control chase view.",
    desc: "Radio Control View add-on for flying from a ground-pilot perspective.",
    website: "https://github.com/eatdust/RCView",
    repo: "eatdust/RCView",
    size: 5,
    year: 2024,
    changes: "Adds an RC-style external view aimed at model and UAV flying.",
    summary: "Keeps the camera on the ground as if you were flying a radio-control model.",
  }),
  fgAddon({
    slug: "flightgear-addon-bombable",
    title: "Bombable",
    tagline: "Military combat add-on.",
    desc: "Bombable 6.0 combat add-on for FlightGear.",
    website: "https://github.com/Aether-FGFS/Bombable-6.0",
    repo: "Aether-FGFS/Bombable-6.0",
    size: 80,
    changes: "Enables AI combat, damage, and weapons hooks for supported aircraft.",
    summary: "Turns compatible aircraft into a simple combat sandbox with AI targets.",
    extraHint:
      "The module loads via --addon. For the full combat set, copy extra AI and sound packs from the Bombable README into FlightGear's AI and Sounds folders.",
  }),
  fgAddon({
    slug: "flightgear-addon-menu-aggregator",
    title: "Add-ons Menu Aggregator",
    tagline: "One menu for every add-on.",
    desc: "Aggregates other add-on menus into a single menu item.",
    website: "https://github.com/PlayeRom/flightgear-addon-menu-aggregator",
    repo: "PlayeRom/flightgear-addon-menu-aggregator",
    size: 3,
    changes: "Collapses per-add-on menu entries into one Add-ons menu.",
    summary: "Stops the menubar from filling with a separate item for every module you enable.",
  }),
  fgAddon({
    slug: "flightgear-addon-anothergui",
    title: "AnotherGUI",
    tagline: "Alternate in-sim GUI style.",
    desc: "Add-on that applies a new GUI style to FlightGear dialogs.",
    website: "https://github.com/SP-NTX/AnotherGUI",
    repo: "SP-NTX/AnotherGUI",
    size: 8,
    changes: "Replaces default dialog chrome with AnotherGUI's style.",
    summary: "A visual restyle of FlightGear's Nasal GUI without rebuilding the simulator.",
  }),
  fgAddon({
    slug: "flightgear-addon-blacklist",
    title: "Blacklist",
    tagline: "Ignore callsigns and MP models.",
    desc: "Automatically ignore multiplayer pilots by callsign or aircraft model.",
    website: "https://gitlab.com/JohanG/blacklist",
    /*
     * Link-out rather than a direct download: GitLab answers 406 to every
     * automated request for its archive endpoints. Confirmed it is the client
     * and not the URL — the same link returns 200 in a browser, while both
     * plain Node and Electron's own fetch (which is what the launcher
     * downloads with) get 406, and the /api/v4 archive endpoint behaves the
     * same. Nothing we can send fixes it, so the honest recipe is to send the
     * player to the project page and let their browser fetch it.
     */
    kind: "external",
    size: 4,
    changes: "Hides blacklisted multiplayer callsigns and models from the session.",
    summary: "Lets you mute problem callsigns or models on busy multiplayer networks.",
  }),
  fgAddon({
    slug: "flightgear-addon-cargo-towing",
    title: "Cargo Towing",
    tagline: "Sling loads for any helicopter.",
    desc: "Cargo towing and stacking add-on for helicopters and other aircraft.",
    website: "https://github.com/wlbragg/Cargo-Towing-Addon",
    repo: "wlbragg/Cargo-Towing-Addon",
    size: 25,
    changes: "Adds sling-load cargo, winch length, and stacking without a custom aircraft fork.",
    summary: "Hooks generic cargo hauling onto aircraft that never shipped a longline.",
  }),
  fgAddon({
    slug: "flightgear-addon-ground-services",
    title: "Ground Services",
    tagline: "Generic airport ground vehicles.",
    desc: "Aircraft-independent ground services add-on (ported by ThomasS).",
    website: "https://github.com/thomass171/GroundServices",
    repo: "thomass171/GroundServices",
    size: 20,
    changes: "Drives generic ground vehicles on taxiways without a per-aircraft ground-service fork.",
    summary: "A shared ground-service module so airports can have follow-me and service traffic beyond one airliner pack.",
  }),
  fgAddon({
    slug: "flightgear-addon-hoppie-acars",
    title: "Hoppie ACARS",
    tagline: "Hoppie network ACARS client.",
    desc: "Connects FlightGear to Hoppie's ACARS used on VATSIM and other networks.",
    website: "https://github.com/tdammers/fg-hoppie-acars",
    repo: "tdammers/fg-hoppie-acars",
    size: 5,
    changes: "Exposes globals.acars and a dialog to send/receive Hoppie messages.",
    summary: "Gives aircraft a Hoppie ACARS pipe once you add a logon token under /sim/hoppie/.",
  }),
  fgAddon({
    slug: "flightgear-addon-hud-heli",
    title: "HUD Heli",
    tagline: "Extra helicopter HUDs.",
    desc: "Helicopter HUD pack wrapped as a FlightGear add-on module.",
    website: "https://github.com/slawekmikula/flightgear-addon-hudheli",
    repo: "slawekmikula/flightgear-addon-hudheli",
    size: 8,
    changes: "Adds additional heli HUD layouts from the HeliHUD package.",
    summary: "Puts extra helicopter HUD options in the add-on menu instead of per-aircraft copies.",
  }),
  fgAddon({
    slug: "flightgear-addon-kml-exporter",
    title: "KML Exporter",
    tagline: "Export the flight path to Google Earth.",
    desc: "Writes the session track to KML for Google Earth.",
    website: "https://github.com/slawekmikula/flightgear-addon-protocolkml",
    repo: "slawekmikula/flightgear-addon-protocolkml",
    size: 4,
    changes: "Records a KML track you can open in Google Earth after the flight.",
    summary: "Exports the path you flew without wiring a custom generic protocol by hand.",
  }),
  fgAddon({
    slug: "flightgear-addon-landing-rate",
    title: "Landing Rate",
    tagline: "Touchdown rate and landing score.",
    desc: "Shows landing stats and can announce them on multiplayer.",
    website: "https://github.com/RenanMsV/landing_rate",
    repo: "RenanMsV/landing_rate",
    size: 4,
    changes: "Rates touchdowns from descent rate and can send the result on MP chat.",
    summary: "Gives instant feedback on how hard you arrived, on most aircraft with no extra config.",
  }),
  fgAddon({
    slug: "flightgear-addon-littlenavmap",
    title: "LittleNavMap integration",
    tagline: "Talk to Little Navmap from FG.",
    desc: "FlightGear add-on that integrates with Little Navmap.",
    website: "https://github.com/slawekmikula/flightgear-addon-littlenavmap",
    repo: "slawekmikula/flightgear-addon-littlenavmap",
    size: 6,
    changes: "Bridges simulator position and plans to a running Little Navmap instance.",
    summary: "Keeps Little Navmap in sync so you can brief and navigate on a moving map.",
  }),
  fgAddon({
    slug: "flightgear-addon-linuxtrack",
    title: "LinuxTrack integration",
    tagline: "Head tracking on Linux.",
    desc: "Add-on that feeds LinuxTrack head-tracker data into FlightGear views.",
    website: "https://github.com/slawekmikula/flightgear-addon-linuxtrack",
    repo: "slawekmikula/flightgear-addon-linuxtrack",
    size: 5,
    platforms: ["Linux"],
    changes: "Enables LinuxTrack UDP/pipe head tracking from the Add-on menu.",
    summary: "The Nasal module for LinuxTrack — you still run ltr_pipe on the host.",
    extraHint:
      "Linux only. Install LinuxTrack and run ltr_pipe with --output-net-udp --format-flightgear before you fly.",
  }),
  fgAddon({
    slug: "flightgear-addon-nogrounddamage",
    title: "noGroundDamage",
    tagline: "Pause C172/C182 ground damage.",
    desc: "Temporarily disables ground damage after landing for the c172/c182.",
    website: "https://github.com/hbeni/fgfs-noGroundDamage",
    repo: "hbeni/fgfs-noGroundDamage",
    size: 2,
    changes: "Lets you taxi and park the Cessna 172/182 without the stock ground-damage logic firing.",
    summary: "A small safety switch for training circuits in the default Cessnas.",
  }),
  fgAddon({
    slug: "flightgear-addon-ramp-marshall",
    title: "Ramp Marshall",
    tagline: "Place marshallers at any gate.",
    desc: "Persistent ramp marshallers you can drop at FlightGear airports.",
    website: "https://github.com/wlbragg/ramp-marshall",
    repo: "wlbragg/ramp-marshall",
    size: 15,
    changes: "Lets you place and save marshallers that guide you onto a stand.",
    summary: "Adds airport marshalling without waiting for scenery authors to bake it in.",
    extraHint:
      "After the first run, add --data= for $FG_HOME/Export/Addons/org.flightgear.addons.rampmarshall so saved marshallers reload.",
  }),
  fgAddon({
    slug: "flightgear-addon-simbrief",
    title: "SimBrief import",
    tagline: "Import SimBrief plans, fuel, and winds.",
    desc: "Imports SimBrief flightplans, weights, fuel, and winds aloft.",
    website: "https://github.com/tdammers/fg-simbrief-addon",
    repo: "tdammers/fg-simbrief-addon",
    size: 5,
    changes: "Adds an Equipment → SimBrief dialog to pull OFP data into FlightGear.",
    summary: "Loads a SimBrief OFP into the route manager and, where the aircraft allows, fuel and payload.",
  }),
  fgAddon({
    slug: "flightgear-addon-vfr-flying-helper",
    title: "VFR Flying Helper",
    tagline: "Compact VFR map and helpers.",
    desc: "VFR navigator helper with a simplified map and common settings shortcuts.",
    website: "https://github.com/slawekmikula/flightgear-addon-vfrnavigator",
    repo: "slawekmikula/flightgear-addon-vfrnavigator",
    size: 8,
    changes: "Adds a VFR starter window with map, route, and quick settings.",
    summary: "A lightweight VFR companion for visual navigation without a full glass FMS.",
  }),
  fgAddon({
    slug: "flightgear-addon-highairtrader",
    title: "HighAirTrader",
    tagline: "Haul cargo between airports.",
    desc: "In-sim mini-game: transport goods to different airports.",
    website: "https://github.com/peterclifton/HighAirTrader",
    repo: "peterclifton/HighAirTrader",
    size: 10,
    changes: "Adds cargo jobs and a trader loop you fly with any aircraft.",
    summary: "Turns a normal cross-country into a short- or long-haul trading game.",
  }),
  fgAddon({
    slug: "flightgear-addon-red-griffin-atc",
    title: "Red Griffin ATC",
    tagline: "Speaking air traffic controller.",
    desc: "Speaking ATC add-on for ground, takeoff, approach, and landing.",
    website: "https://sourceforge.net/projects/red-griffin-atc/",
    kind: "direct-zip",
    direct: "https://sourceforge.net/projects/red-griffin-atc/files/latest/download",
    size: 30,
    changes: "Adds a voiced ATC client with keyboard and menu controls.",
    summary: "A full speaking controller for VFR and IFR procedures using FlightGear's speech synth.",
  }),
];

const freedoomMods: ModSeed[] = [
  m({ slug: 'freedoom-dsda', title: 'DSDA-Doom', tagline: 'Recommended source port.', desc: 'Recommended source port.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/kraflab/dsda-doom', repo: 'kraflab/dsda-doom', changes: 'Play Freedoom WADs.', summary: 'Recommended source port.' }),
  m({ slug: 'freedoom-gzdoom', title: 'GZDoom', tagline: 'Feature-rich Doom port.', desc: 'Feature-rich Doom port.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/ZDoom/gzdoom', repo: 'ZDoom/gzdoom', changes: 'Hardware renderer.', summary: 'Feature-rich Doom port.' }),
  m({ slug: 'freedoom-brutal', title: 'Brutal Doom hub', tagline: 'Popular gameplay overhaul (external).', desc: 'Popular gameplay overhaul (external).', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://www.moddb.com/mods/brutal-doom', kind: 'external', changes: 'Action overhaul.', summary: 'Popular gameplay overhaul (external).' }),
  m({ slug: 'freedoom-obaddon', title: 'ObAddon', tagline: 'Procedural map addons.', desc: 'Procedural map addons.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/caligari87/ObAddon', repo: 'caligari87/ObAddon', changes: 'Endless layouts.', summary: 'Procedural map addons.' }),
  m({ slug: 'freedoom-launcher', title: 'Doom Launcher', tagline: 'WAD organizer tool.', desc: 'WAD organizer tool.', base: 'freedoom', baseTitle: 'Freedoom', path: 'mods', website: 'https://github.com/nickpasquale89/DoomLauncher', kind: 'external', changes: 'Manage PWAD sets.', summary: 'WAD organizer tool.' }),
];

const lincityMods: ModSeed[] = [
];

const tesArenaMods: ModSeed[] = [
  m({ slug: 'tes-arena-dosbox', title: 'DOSBox Staging', tagline: 'Run classic Arena in DOSBox.', desc: 'Run classic Arena in DOSBox.', base: 'tes-arena', baseTitle: 'The Elder Scrolls: Arena', path: 'mods', website: 'https://github.com/dosbox-staging/dosbox-staging', repo: 'dosbox-staging/dosbox-staging', changes: 'DOS emulator.', summary: 'Run classic Arena in DOSBox.' }),
];

/** Quake III–style FPS — not related to Elder Scrolls: Arena. */
const openarenaMods: ModSeed[] = [
];

const daggerfallMods: ModSeed[] = [
];

/** OpenCiv3 (C7) — early remake; ecosystem hubs + tools more than total-conversion mods. */
const openciv3Mods: ModSeed[] = [
];

export const phase2ModsRemasters: ModSeed[] = [
  freecivMods,
  flightgearMods,
  freedoomMods,
  lincityMods,
  tesArenaMods,
  openarenaMods,
  daggerfallMods,
  openciv3Mods,
].flat();
