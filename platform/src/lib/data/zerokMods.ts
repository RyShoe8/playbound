/**
 * Curated maps, HUD widgets, and skirmish gameplay mutators for Zero-K.
 * 1-click install into Zero-K maps/mods folder.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

const ZK_HINT =
  "Install via PlayBound 1-click directly into Zero-K's maps or mods directory.";

export const zerokMods: ModSeed[] = [
  ghMod({
    slug: "zerok-speed-metal-remastered",
    title: "Speed Metal Remastered Map",
    tagline: "The legendary high-metal fast-paced skirmish and 8v8 battleground.",
    description:
      "The classic ultra-high-economy RTS battleground remastered with modern water shaders, balanced hill plateaus, and optimized metal distribution for non-stop action.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "CC-BY-SA-4.0",
    releaseYear: 2019,
    sizeMB: 12,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "maps/SpeedMetal_Remastered.sd7",
    art: { from: "#334155", to: "#475569", icon: "Flame" },
    summary:
      "All-time favorite LAN and lobby map where unlimited metal yields colossal armies and epic superweapon clashes.",
    changes:
      "Adds the Speed Metal Remastered map with enhanced heightmaps, custom metal extractor grid, and 2-16 player start positions.",
    installHint: ZK_HINT,
  }),
  ghMod({
    slug: "zerok-comet-catcher-redux",
    title: "Comet Catcher Redux Map",
    tagline: "Competitive 1v1 and 2v2 cratered lunar surface tournament map.",
    description:
      "A competitive tournament staple featuring crater valleys, radar-blocking ridges, and strategic metal nodes designed for precision tactical maneuver warfare.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "CC-BY-SA-4.0",
    releaseYear: 2020,
    sizeMB: 15,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "maps/Comet_Catcher_Redux.sd7",
    art: { from: "#0f172a", to: "#38bdf8", icon: "Moon" },
    summary:
      "Tournament-standard lunar terrain requiring vision control, elevation advantages, and raiding maneuvers.",
    changes:
      "Adds Comet Catcher Redux map with balanced metal layouts, clean pathfinding meshes, and competitive spawn locations.",
    installHint: ZK_HINT,
  }),
  ghMod({
    slug: "zerok-altair-crossing",
    title: "Altair Crossing 4v4 Map",
    tagline: "Large team map with river crossings and resource-rich mountain passes.",
    description:
      "Designed for 4v4 to 6v6 team matches, Altair Crossing features deep river canyons, amphibious choke points, and high-altitude artillery plateaus.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "CC-BY-SA-4.0",
    releaseYear: 2021,
    sizeMB: 22,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "maps/Altair_Crossing.sd7",
    art: { from: "#064e3b", to: "#10b981", icon: "Mountain" },
    summary:
      "Grand team battleground balancing frontline tank engagements with flanking amphibious and airborne operations.",
    changes:
      "Adds Altair Crossing team map with water physics, bridge crossings, and coordinated team spawn zones.",
    installHint: ZK_HINT,
  }),
  ghMod({
    slug: "zerok-tangerine-oasis",
    title: "Tangerine Oasis Map",
    tagline: "Desert dunes and palm oases with tactical solar energy boosts.",
    description:
      "A vibrant desert skirmish arena featuring sun-drenched canyon passes, shaded oasis outposts, and expansive flat plains for swift hovercraft and vehicle raids.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "CC-BY-SA-4.0",
    releaseYear: 2022,
    sizeMB: 18,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "maps/Tangerine_Oasis.sd7",
    art: { from: "#78350f", to: "#f59e0b", icon: "Sun" },
    summary:
      "Fast-paced desert battlefield with dynamic dune elevation changes and open flanking avenues.",
    changes:
      "Adds Tangerine Oasis map with custom sand particle dust storms, oasis water features, and balanced resource distribution.",
    installHint: ZK_HINT,
  }),
  ghMod({
    slug: "zerok-hud-overlay-suite",
    title: "Zero-K Pro HUD Overlay Suite",
    tagline: "Advanced UI widgets for eco tracking, damage graphs, and range circles.",
    description:
      "A suite of curated Lua UI widgets for Zero-K including precision weapon range overlays, energy grid stall warnings, advanced player status lists, and real-time damage telemetry.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "GPL-2.0-or-later",
    releaseYear: 2023,
    sizeMB: 5,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "LuaUI/Widgets/Pro_HUD_Suite",
    art: { from: "#1e1b4b", to: "#6366f1", icon: "BarChart3" },
    summary:
      "Competitive player HUD add-on providing clear visual feedback on commander energy links, radar coverage, and weapon ranges.",
    changes:
      "Adds customizable UI widgets for weapon range projections, team resource flows, and APM statistics.",
    installHint: ZK_HINT,
  }),
  ghMod({
    slug: "zerok-tactical-nukes-mutator",
    title: "Tactical Nukes & Superweapons Mutator",
    tagline: "Gameplay mutator enabling rapid-fire tactical missiles and orbital strikes.",
    description:
      "A high-impact mutator for skirmish and custom lobbies that accelerates missile silo construction, adds tactical cruise missiles, and unlocks experimental superweapons.",
    baseGameSlug: "zero-k",
    developerSlug: "indie-web",
    baseTitle: "Zero-K",
    license: "GPL-2.0-or-later",
    releaseYear: 2022,
    sizeMB: 8,
    website: "https://github.com/ZeroK-RTS/Zero-K",
    githubRepo: "ZeroK-RTS/Zero-K",
    downloadKind: "github-zip",
    installRelativePath: "mods/Tactical_Nukes_Mutator",
    art: { from: "#831843", to: "#f43f5e", icon: "Radioactive" },
    summary:
      "High-energy mutator adding explosive late-game strategic weapon options for sandbox and skirmish battles.",
    changes:
      "Adds custom weapon scripts, reduced superweapon recharge timers, and orbital bombardment abilities.",
    installHint: ZK_HINT,
  }),
];
