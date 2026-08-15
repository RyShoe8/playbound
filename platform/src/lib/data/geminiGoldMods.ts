/**
 * Curated mods & community add-ons for Privateer Gemini Gold.
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
    developerSlug: d.developerSlug ?? "privateer-gemini-gold",
    license: d.license ?? "GPL-2.0 / Community Add-on",
    releaseYear: d.year ?? 2009,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path,
    compatibility: d.compat ?? "Privateer Gemini Gold 1.03",
    platforms: d.platforms,
    installSteps: d.steps,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const geminiGoldMods: ModSeed[] = [
  m({
    slug: "gemini-gold-speech-pack",
    title: "Gemini Gold Full Speech & Radio Pack",
    tagline: "Restores digital voice acting and comms chatter to Gemini Gold.",
    desc: "Re-integrates classic digitized voice acting and in-flight comm chatter for wingmen, pirates, merchants, and guild fixers across the Gemini Sector.",
    base: "privateer-gemini-gold",
    baseTitle: "Privateer Gemini Gold",
    path: "sound/speech",
    website: "https://privateer.sourceforge.net",
    kind: "direct-zip",
    direct: "https://downloads.sourceforge.net/project/privateer/Wing%20Commander%20Privateer/Privateer%20Gemini%20Gold%201.03/GeminiGoldSpeech.zip",
    size: 48,
    year: 2008,
    license: "Community Add-on / Fair Use",
    changes: "Enables digitized NPC audio in bars, guild offices, and in-flight communication channels.",
    summary: "Adds full spoken dialogue for bartenders, guild fixers, and space traffic radio chatter across all Gemini systems.",
    compat: "Privateer Gemini Gold 1.02 and 1.03",
    hint: "Extract archive into the sound folder in your Privateer Gemini Gold installation directory.",
    art: { from: "#1e1b4b", to: "#f59e0b", icon: "Volume2" },
  }),
  m({
    slug: "gemini-gold-hd-maps",
    title: "Gemini Sector High-Resolution Nav Map",
    tagline: "Crisp vector star charts and faction territory overlays for the nav computer.",
    desc: "Replaces the original low-resolution navigation computer textures with sharp, high-contrast star charts showing clear jump point paths, faction borders, and mining outposts.",
    base: "privateer-gemini-gold",
    baseTitle: "Privateer Gemini Gold",
    path: "textures/nav",
    website: "https://privateer.sourceforge.net",
    kind: "direct-zip",
    direct: "https://downloads.sourceforge.net/project/privateer/Wing%20Commander%20Privateer/Privateer%20Gemini%20Gold%201.03/GeminiSectorHDMap.zip",
    size: 12,
    year: 2009,
    license: "CC-BY-SA-3.0",
    changes: "High-definition quadrant maps, faction territory outlines, and clear jump routes in the ship nav computer.",
    summary: "Upgrades navigation computer displays to crisp modern resolutions with colored faction boundaries and waypoint markers.",
    compat: "All versions of Privateer Gemini Gold",
    hint: "Place map texture archives in the textures/nav directory under your game installation.",
    art: { from: "#0f172a", to: "#38bdf8", icon: "Compass" },
  }),
  m({
    slug: "gemini-gold-orchestral-soundtrack",
    title: "Remastered Orchestral Soundtrack",
    tagline: "High-fidelity orchestral recordings of the classic Privateer score.",
    desc: "Replaces standard soundfont synthesizer music with high-bitrate orchestral recordings of the classic 1993 Wing Commander Privateer bar, base, and space themes.",
    base: "privateer-gemini-gold",
    baseTitle: "Privateer Gemini Gold",
    path: "music",
    website: "https://privateer.sourceforge.net",
    kind: "direct-zip",
    direct: "https://downloads.sourceforge.net/project/privateer/Wing%20Commander%20Privateer/Privateer%20Gemini%20Gold%201.03/GeminiGoldMusicPack.zip",
    size: 85,
    year: 2010,
    license: "GPL-2.0 / Community Music",
    changes: "Full soundtrack upgrade with 24 high-definition symphonic arrangements of in-game music.",
    summary: "Replaces MIDI synth playback with recorded virtual symphonic arrangements of all bar themes, combat music, and system ambiance.",
    compat: "Privateer Gemini Gold 1.0+",
    hint: "Extract music files into the music directory of your Gemini Gold install.",
    art: { from: "#311042", to: "#ec4899", icon: "Music" },
  }),
];
