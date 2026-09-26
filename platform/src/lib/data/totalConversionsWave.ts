/**
 * High-quality community total conversions, expansions, and engine modernizations.
 *
 * Each project meets the PlayBound quality threshold:
 * fully functional, actively maintained or classic complete, and non-trivial program enhancements.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

type Def = {
  slug: string;
  title: string;
  tagline: string;
  desc: string;
  base: string;
  baseTitle: string;
  path?: string;
  website: string;
  developerSlug: string;
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
    developerSlug: d.developerSlug,
    license: d.license ?? "Open Source / Community",
    releaseYear: d.year ?? 2024,
    sizeMB: d.size ?? 25,
    website: d.website,
    githubRepo: d.repo ?? null,
    downloadKind: kind,
    assetPattern: d.pattern ?? null,
    directUrl: d.direct ?? null,
    installRelativePath: d.path ?? "mods",
    compatibility: d.compat ?? `${d.baseTitle} PC`,
    summary: d.summary,
    changes: d.changes,
    installHint: d.hint,
    art: d.art,
  });
}

export const totalConversionsWave: ModSeed[] = [
  /* ── The Elder Scrolls III: Morrowind ───────────────────────────────── */
  m({
    slug: "morrowind-tamriel-rebuilt",
    title: "Tamriel Rebuilt",
    tagline: "The monumental community project seamlessly reconstructing the entire Morrowind mainland.",
    desc: "Two decades in development, Tamriel Rebuilt is one of the most ambitious modding endeavors in gaming history. It seamlessly expands Morrowind beyond Vvardenfell to reconstruct the entire provincial mainland with thousands of hand-crafted quests, lore-accurate factions, bustling metropolises like Necrom and Old Ebonheart, and perilous subterranean ruins.",
    base: "morrowind",
    baseTitle: "The Elder Scrolls III: Morrowind",
    developerSlug: "bethesda",
    website: "https://www.nexusmods.com/morrowind/mods/42145",
    direct: "https://www.tamriel-rebuilt.org/releases/mainland",
    kind: "external",
    path: "Data Files",
    size: 650,
    year: 2024,
    changes: "Adds mainland Telvanni peninsula, sacred Necrom city, Old Ebonheart capital, and hundreds of mainland quests.",
    summary: "Massive community mega-expansion adding the entire continental mainland of Morrowind.",
    hint: "Extract data archives into your Morrowind/Data Files or add the data directory to openmw.cfg.",
    art: { from: "#78350f", to: "#d97706", icon: "Map" },
  }),

  /* ── Heroes of Might and Magic III: Complete ────────────────────────── */
  m({
    slug: "homm3-hd-mod",
    title: "HoMM3 HD Mod",
    tagline: "Essential high-resolution rendering, 60 FPS animation smoothing, and streamlined UI.",
    desc: "The definitive engine and UI enhancement for Heroes of Might and Magic III. Adds native support for high-definition widescreen display resolutions up to 4K, 32-bit True Color rendering, 60 FPS animation interpolation, quick army-splitting hotkeys, and tournament template management.",
    base: "heroes-of-might-and-magic-3-complete",
    baseTitle: "Heroes of Might and Magic III: Complete",
    developerSlug: "new-world-computing",
    website: "https://sites.google.com/site/heroes3hd/",
    direct: "https://sites.google.com/site/heroes3hd/files/HoMM3_HD_Latest.exe",
    kind: "direct-zip",
    path: "",
    size: 25,
    year: 2024,
    changes: "Adds arbitrary resolution support, smooth animation interpolation, and fast army management hotkeys.",
    summary: "Must-have engine modernization bringing high resolutions, 60 FPS fluidity, and clean inventory management.",
    hint: "Run HD_Launcher.exe located in your Heroes III install directory to choose resolution and launch.",
    art: { from: "#1e3a8a", to: "#3b82f6", icon: "Monitor" },
  }),

  /* ── Thief Gold ─────────────────────────────────────────────────────── */
  m({
    slug: "thief-gold-tfix",
    title: "TFix — NewDark Engine Upgrade",
    tagline: "Widescreen display, 144Hz physics interpolation, and hardware OpenAL 3D positional audio.",
    desc: "TFix brings Thief Gold up to the modern NewDark 1.27 engine standards. It resolves multi-core processor lockups, integrates native widescreen FOV scaling, uncaps framerates with smooth 144Hz physics interpolation, and restores authentic hardware OpenAL 3D spatial audio.",
    base: "thief-gold",
    baseTitle: "Thief Gold",
    developerSlug: "looking-glass-studios",
    website: "https://www.ttlg.com/forums/showthread.php?t=134733",
    direct: "https://github.com/vfig/TFix/releases/download/v1.27/TFix_1.27.exe",
    kind: "direct-zip",
    path: "",
    size: 150,
    year: 2024,
    changes: "NewDark 1.27 engine update, 144Hz physics interpolation, widescreen FOV, and OpenAL 3D sound.",
    summary: "Essential engine modernization for Thief Gold ensuring rock-solid stability and modern display support.",
    hint: "Run the TFix installer and target your Thief Gold installation directory.",
    art: { from: "#0f172a", to: "#334155", icon: "Sliders" },
  }),

  /* ── Sonic Robo Blast 2 ─────────────────────────────────────────────── */
  m({
    slug: "srb2-persona",
    title: "SRB2 Persona",
    tagline: "Turn-based JRPG dungeon crawler conversion complete with Tartarus floors and Persona fusions.",
    desc: "A stunning total conversion that re-engineers the 3D Sonic engine into a full-scale turn-based JRPG. Navigate procedural dungeon towers, exploit elemental weaknesses to trigger '1 More' and 'All-Out Attacks', manage SP pools, and visit the Velvet Room to fuse dozens of community Personas.",
    base: "srb2",
    baseTitle: "Sonic Robo Blast 2",
    developerSlug: "sonic-team-junior",
    website: "https://mb.srb2.org/addons/srb2-persona.115/",
    direct: "https://mb.srb2.org/addons/srb2-persona.115/download",
    kind: "external",
    path: "addons",
    size: 180,
    year: 2024,
    changes: "Turn-based battle engine, floor-by-floor dungeon crawling, Persona fusion system, and custom UI.",
    summary: "Complete JRPG total conversion adapting Shin Megami Tensei / Persona mechanics into SRB2.",
    hint: "Place srb2persona.pk3 into your srb2/addons folder and load it via command line or in-game Addons menu.",
    art: { from: "#dc2626", to: "#ef4444", icon: "Zap" },
  }),

  /* ── Cataclysm: Dark Days Ahead ─────────────────────────────────────── */
  m({
    slug: "cataclysm-dda-magiclysm",
    title: "Magiclysm",
    tagline: "Transforms the post-apocalyptic world into an arcane fantasy apocalypse with spells and beasts.",
    desc: "Magiclysm reinvents CDDA by layering a rich magic system over the survival sandbox. Learn arcane spells from ancient grimoires, dedicate your survivor to specialized disciplines (Kelvinist, Stormshaper, Animist, Technomancer), explore wizard sanctums, and battle dragons and mutated chimera.",
    base: "cataclysm-dda",
    baseTitle: "Cataclysm: Dark Days Ahead",
    developerSlug: "cleverraven",
    website: "https://github.com/CleverRaven/Cataclysm-DDA",
    kind: "external",
    path: "data/mods/Magiclysm",
    size: 15,
    year: 2024,
    changes: "Adds mana pools, spellbook crafting, 4 core magical classes, enchanting shrines, and mythical beasts.",
    summary: "Arcane fantasy conversion introducing comprehensive spellcasting and magical exploration.",
    hint: "Select Magiclysm in the World Creation -> Mod Selection menu when creating your survival world.",
    art: { from: "#7c3aed", to: "#a855f7", icon: "Sparkles" },
  }),

  /* ── Re-Volt (RVGL) ─────────────────────────────────────────────────── */
  m({
    slug: "re-volt-io-pack",
    title: "RVGL I/O Community Track & Car Pack",
    tagline: "Curated collection of 100+ tournament-grade custom RC cars and tracks with calibrated physics.",
    desc: "The competitive gold standard pack for online RVGL lobbies. Compiles over 100 tournament-tested community tracks, balanced RC car classes, HD surface textures, custom soundtrack modules, and optimized collision meshes for intense multiplayer racing.",
    base: "re-volt-rvgl",
    baseTitle: "Re-Volt (RVGL)",
    developerSlug: "rvgl-team",
    website: "https://www.re-volt.io/packs",
    direct: "https://distribute.re-volt.io/packs/io_tracks.zip",
    kind: "direct-zip",
    path: "",
    size: 350,
    year: 2024,
    changes: "Adds 100+ vetted community race tracks, tournament car balance profiles, and custom track SFX.",
    summary: "Standard competitive track and vehicle library for online multiplayer RVGL matches.",
    hint: "Extract the zip contents directly into your RVGL root directory.",
    art: { from: "#059669", to: "#10b981", icon: "Layers" },
  }),

  /* ── Old School RuneScape ───────────────────────────────────────────── */
  m({
    slug: "osrs-117hd",
    title: "117 HD Plugin",
    tagline: "Open-source RuneLite visual overhaul with dynamic lighting, shadows, and water reflections.",
    desc: "The landmark visual modernization plugin for RuneLite. Adds GPU-accelerated real-time lighting passes, dynamic atmospheric shadows, seasonal environmental effects, procedural water reflections, and customizable color grading profiles while retaining classic OSRS aesthetics.",
    base: "old-school-runescape",
    baseTitle: "Old School RuneScape",
    developerSlug: "jagex",
    website: "https://github.com/117_hd/117hd",
    kind: "external",
    path: ".runelite/plugins",
    size: 30,
    year: 2024,
    changes: "Dynamic lighting, shadow mapping, atmospheric fog, procedural water, and seasonal color presets.",
    summary: "Visual engine overhaul rendering dynamic atmospheric lighting and reflections inside RuneLite.",
    hint: "In RuneLite, open the Plugin Hub (wrench icon -> Plugin Hub) and install 117 HD with one click.",
    art: { from: "#0284c7", to: "#38bdf8", icon: "Sun" },
  }),
];
