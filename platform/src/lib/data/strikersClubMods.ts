/**
 * Curated community enhancements, camera presets, and training drills for Strikers Club.
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
    developerSlug: d.developerSlug ?? "oddshot-games",
    license: d.license ?? "Free / Open Source",
    releaseYear: d.year ?? 2026,
    sizeMB: d.size ?? 10,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Strikers Club Steam",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const strikersClubMods: ModSeed[] = [
  m({
    slug: "strikers-pro-camera-preset",
    title: "Wide Tactical & Broadcast Camera Preset",
    tagline: "Expanded field of view and high-elevation camera angle for total pitch awareness.",
    desc: "A tournament-approved camera configuration providing an elevated wide-angle view of the entire pitch. Dramatically improves peripheral vision for spotting off-the-ball teammate runs and anticipating defensive interceptions.",
    base: "strikers-club",
    baseTitle: "Strikers Club",
    path: "Config/Camera",
    website: "https://oddshot.gg/",
    direct: "https://oddshot.gg/downloads/StrikersTacticalCamera.zip",
    kind: "direct-zip",
    size: 2,
    year: 2026,
    changes: "Sets FOV to 105 degrees, elevates camera height by 20%, and smooths tracking interpolation during fast transitions.",
    summary: "Essential camera configuration for competitive club matches and tactical playmaking.",
    compat: "Strikers Club all versions",
    hint: "Copy the camera config into your Strikers Club user settings folder.",
    art: { from: "#047857", to: "#10b981", icon: "Eye" },
  }),
  m({
    slug: "strikers-training-drills",
    title: "Solo Dribble & Precision Strike Training Gym",
    tagline: "Custom training scenarios for mastering curved wall rebounds, one-touch volleys, and penalty kicks.",
    desc: "A curated suite of solo practice gym drills designed to accelerate mechanical mastery. Practice tight dribble weaving around cones, timing bicycle kicks from cross passes, and curving top-corner free kicks.",
    base: "strikers-club",
    baseTitle: "Strikers Club",
    path: "CustomDrills",
    website: "https://oddshot.gg/",
    direct: "https://oddshot.gg/downloads/StrikersTrainingDrills.zip",
    kind: "direct-zip",
    size: 15,
    year: 2026,
    changes: "Adds 12 dedicated practice routines covering first touches, wall rebounds, lob passes, and goalkeeping reflexes.",
    summary: "Comprehensive skill development drill pack for solo training before jumping into ranked club play.",
    compat: "Strikers Club all versions",
    hint: "Place drill files in the CustomDrills directory and load them from the main menu Practice tab.",
    art: { from: "#0284c7", to: "#38bdf8", icon: "Target" },
  }),
  m({
    slug: "strikers-controller-curve-config",
    title: "Precision Analog Response & Deadzone Profiles",
    tagline: "Calibrated stick curve profiles for Xbox, PlayStation, and Nintendo Switch controllers.",
    desc: "Optimized analog stick input mapping curves that remove unwanted controller deadzones and establish linear directional touch response. Enhances subtle micro-adjustments when dribbling through tight defensive boxes.",
    base: "strikers-club",
    baseTitle: "Strikers Club",
    path: "Config/Input",
    website: "https://oddshot.gg/",
    direct: "https://oddshot.gg/downloads/StrikersControllerCurves.zip",
    kind: "direct-zip",
    size: 1,
    year: 2026,
    changes: "Provides calibrated response curves for DualSense, Xbox Wireless, and Switch Pro controllers.",
    summary: "Controller optimization profiles providing razor-sharp analog control for dribbling and shot steering.",
    compat: "Strikers Club all versions",
    hint: "Import the input profile via Steam Controller Configuration or in-game control settings.",
    art: { from: "#d97706", to: "#f59e0b", icon: "Gamepad2" },
  }),
];
