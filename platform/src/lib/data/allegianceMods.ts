/**
 * Curated community enhancements, texture packs, and server tools for Microsoft Allegiance.
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
  developerSlug?: string;
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
  art?: { from: string; to: string; icon: string };
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
    developerSlug: d.developerSlug ?? "freeallegiance-team",
    license: d.license ?? "Open Source (Free Software)",
    releaseYear: d.year ?? 2023,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "FreeAllegiance / Steam",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const allegianceMods: ModSeed[] = [
  m({
    slug: "allegiance-high-res-textures",
    title: "High-Definition Cockpits & Nebula Skyboxes",
    tagline: "4K sector nebulae, high-res starfield cubemaps, and remastered ship cockpit glass.",
    desc: "Replaces standard resolution planetary skyboxes, starfields, and ship cockpit interior textures with crisp high-definition renders created by the FreeAllegiance art team.",
    base: "microsoft-allegiance",
    baseTitle: "Microsoft Allegiance",
    path: "Artwork/Textures",
    website: "https://www.freeallegiance.org/",
    direct: "https://www.freeallegiance.org/download/AllegianceHDTextures.zip",
    kind: "direct-zip",
    size: 120,
    year: 2023,
    changes: "Remasters all sector background nebulae, asteroid surface textures, and starfighter cockpit instrumentation.",
    summary: "Complete visual remaster enhancing space sector ambiance and pilot cockpit fidelity.",
    compat: "FreeAllegiance all versions",
    hint: "Extract into the Artwork folder in your Allegiance install directory.",
    art: { from: "#1e1b4b", to: "#38bdf8", icon: "Sparkles" },
  }),
  m({
    slug: "allegiance-hud-customizer",
    title: "Tactical Pilot HUD & Reticle Suite",
    tagline: "Customizable vector combat HUDs, high-contrast target reticles, and energy readouts.",
    desc: "A collection of tournament-tested pilot HUD overlays and color profiles. Improves radar contact clarity, target lead indicator accuracy, and shield/hull energy gauge visibility during fast-paced dogfights.",
    base: "microsoft-allegiance",
    baseTitle: "Microsoft Allegiance",
    path: "Artwork/HUD",
    website: "https://www.freeallegiance.org/",
    direct: "https://www.freeallegiance.org/download/AllegianceCustomHUD.zip",
    kind: "direct-zip",
    size: 15,
    year: 2023,
    changes: "Adds high-contrast radar blips, customizable lead reticles, and compact throttle gauges.",
    summary: "Competitive tactical HUD package optimizing combat awareness for fighter and scout pilots.",
    compat: "FreeAllegiance all versions",
    hint: "Select your preferred HUD profile from the Allegiance launcher graphics tab.",
    art: { from: "#059669", to: "#34d399", icon: "Sliders" },
  }),
  m({
    slug: "allegiance-acss-server-suite",
    title: "FreeAllegiance Dedicated Server Suite",
    tagline: "Official dedicated match server and lobby administration software for community hosts.",
    desc: "The complete server hosting toolkit used by the FreeAllegiance community. Enables running dedicated multi-sector match servers, automatic squad league logging, map cycle rotation, and anti-cheat enforcement.",
    base: "microsoft-allegiance",
    baseTitle: "Microsoft Allegiance",
    path: "Server",
    website: "https://www.freeallegiance.org/",
    direct: "https://www.freeallegiance.org/download/AllegServerSetup.exe",
    kind: "direct-zip",
    size: 50,
    year: 2023,
    changes: "Includes dedicated server binaries, match referee administration console, and automated crash recovery.",
    summary: "Dedicated hosting software enabling community squads to run private tournaments and public servers.",
    compat: "Windows Server / Windows 10/11",
    hint: "Run AllSvr.exe to start a local or public FreeAllegiance match server.",
    art: { from: "#7c3aed", to: "#a78bfa", icon: "Server" },
  }),
];
