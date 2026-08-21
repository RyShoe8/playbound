/**
 * Curated high-fidelity aircraft and scenery packs for FlightGear.
 * 1-click install into FlightGear Aircraft / Scenery directories.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

const FG_HINT =
  "Install via PlayBound 1-click directly into FlightGear's Aircraft folder, then select from the aircraft browser.";

export const flightgearMods: ModSeed[] = [
  ghMod({
    slug: "flightgear-boeing-777",
    title: "Boeing 777 Series (777-200ER / 777-300ER)",
    tagline: "High-fidelity wide-body airliner with interactive 3D cockpit and flight computer.",
    description:
      "A flagship FlightGear airliner featuring study-level cockpit systems, working fly-by-wire flight laws, CDU/FMC flight management navigation, dynamic engine acoustics, and animated wing flex.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2012,
    sizeMB: 180,
    website: "https://github.com/FlightGear-Community/777",
    githubRepo: "FlightGear-Community/777",
    downloadKind: "github-zip",
    installRelativePath: "Aircraft/777",
    art: { from: "#0f172a", to: "#1d4ed8", icon: "Plane" },
    summary:
      "The premier long-haul airliner in FlightGear with accurate navigation displays, autoland capabilities, and realistic aerodynamics.",
    changes:
      "Adds the Boeing 777-200ER, 777-200LR, 777-300ER, and 777 Freighter models with interactive glass cockpit displays.",
    installHint: FG_HINT,
  }),
  ghMod({
    slug: "flightgear-airbus-a320neo",
    title: "Airbus A320neo Family",
    tagline: "Modern fly-by-wire airliner with full glass cockpit avionics and MCDU.",
    description:
      "The cutting-edge narrow-body twinjet featuring custom fly-by-wire control laws, full ECAM status pages, working autopilot flight guidance modes, and realistic CFM LEAP engine sounds.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2017,
    sizeMB: 220,
    website: "https://github.com/legoboyvdlp/A320-family",
    githubRepo: "legoboyvdlp/A320-family",
    downloadKind: "github-zip",
    installRelativePath: "Aircraft/A320-family",
    art: { from: "#1e3a8a", to: "#0284c7", icon: "Navigation" },
    summary:
      "Extremely detailed Airbus airliner with true-to-life fly-by-wire logic and interactive MCDU route programming.",
    changes:
      "Adds the Airbus A320neo and A321neo with interactive flight management computers, custom fly-by-wire, and airline liveries.",
    installHint: FG_HINT,
  }),
  ghMod({
    slug: "flightgear-f16-falcon",
    title: "General Dynamics F-16 Fighting Falcon",
    tagline: "Supersonic multirole fighter jet with Heads-Up Display and fly-by-wire.",
    description:
      "A high-performance supersonic military jet featuring authentic JSBSim flight dynamics, functioning MFD weapon system screens, realistic HUD symbology, afterburner thrust, and aerial refueling.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2014,
    sizeMB: 95,
    website: "https://github.com/NikolaiVChr/f16",
    githubRepo: "NikolaiVChr/f16",
    downloadKind: "github-zip",
    installRelativePath: "Aircraft/f16",
    art: { from: "#18181b", to: "#71717a", icon: "Crosshair" },
    summary:
      "High-G capable combat fighter with authentic cockpit displays, afterburner physics, and carrier approach aids.",
    changes:
      "Adds the F-16 Block 50 with interactive HUD, Radar MFD, stores management, and supersonic aerodynamic model.",
    installHint: FG_HINT,
  }),
  ghMod({
    slug: "flightgear-cessna-172p-hd",
    title: "Cessna 172P Skyhawk Detailed Edition",
    tagline: "The world's most popular trainer aircraft with high-res textures and failures.",
    description:
      "An ultra-detailed simulation of the Cessna 172P Skyhawk with realistic engine wear, oil consumption, carburetor icing, bush wheels, amphibian floats, and realistic VFR instruments.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2015,
    sizeMB: 110,
    website: "https://github.com/c172p-team/c172p-detailed",
    githubRepo: "c172p-team/c172p-detailed",
    downloadKind: "github-zip",
    installRelativePath: "Aircraft/c172p-detailed",
    art: { from: "#365314", to: "#65a30d", icon: "Compass" },
    summary:
      "The pinnacle of general aviation in FlightGear with comprehensive maintenance checklists, damage states, and floatplane gear.",
    changes:
      "Adds the advanced Cessna 172P detailed model with high-definition cockpit switches, engine failure states, and float variants.",
    installHint: FG_HINT,
  }),
  ghMod({
    slug: "flightgear-concorde",
    title: "Aérospatiale/BAC Concorde",
    tagline: "Mach 2 supersonic passenger airliner with droop-nose and fuel trim transfer.",
    description:
      "Experience Mach 2 supersonic passenger flight. Features the iconic droop nose mechanism, complex fuel trimming systems for center-of-gravity management, afterburners, and authentic vintage cockpit panels.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2011,
    sizeMB: 130,
    website: "https://github.com/sadbr/Concorde",
    githubRepo: "sadbr/Concorde",
    downloadKind: "github-zip",
    installRelativePath: "Aircraft/Concorde",
    art: { from: "#4c0519", to: "#e11d48", icon: "Gauge" },
    summary:
      "Master the challenges of supersonic airliner operations across the Atlantic with manual fuel balancing and reheat systems.",
    changes:
      "Adds the Concorde supersonic transport with functional engineer's panel, droop nose animations, and supersonic drag models.",
    installHint: FG_HINT,
  }),
  ghMod({
    slug: "flightgear-san-francisco-hd",
    title: "San Francisco Bay Area KSFO HD Scenery",
    tagline: "High-definition custom airport 3D models and landmark scenery for KSFO.",
    description:
      "High-detail airport models for San Francisco International (KSFO), Oakland (KOAK), San Jose (KSJC), plus 3D bridges (Golden Gate, Bay Bridge), Alcatraz, and downtown city buildings.",
    baseGameSlug: "flightgear",
    developerSlug: "indie-web",
    baseTitle: "FlightGear",
    license: "GPL-2.0-or-later",
    releaseYear: 2019,
    sizeMB: 150,
    website: "https://github.com/FlightGear-Community/KSFO-scenery",
    githubRepo: "FlightGear-Community/KSFO-scenery",
    downloadKind: "github-zip",
    installRelativePath: "Scenery/KSFO-scenery",
    art: { from: "#0c4a6e", to: "#0284c7", icon: "MapPin" },
    summary:
      "Rich 3D airport terminals, taxiway lighting, runway textures, and Bay Area landmarks for FlightGear's default departure airport.",
    changes:
      "Adds bespoke 3D terminal buildings, jetways, airport ground markings, and San Francisco city skyline models.",
    installHint: "PlayBound extracts this scenery pack directly into FlightGear's Scenery folder.",
  }),
];
