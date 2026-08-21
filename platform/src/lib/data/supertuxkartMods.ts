/**
 * Curated add-ons, custom tracks, karts, and battle arenas for SuperTuxKart.
 * Available via SuperTuxKart Online Add-ons server and 1-click launcher extraction.
 */
import { ghMod, type ModSeed } from "./modSeedHelpers";

const STK_HINT =
  "Install via PlayBound 1-click into supertuxkart/addons, or in-game via Main Menu → Add-ons.";

export const supertuxkartMods: ModSeed[] = [
  ghMod({
    slug: "stk-olivers-math-class",
    title: "Oliver's Math Class Track",
    tagline: "Gigantic classroom track racing across desks, pencils, and rulers.",
    description:
      "A fan-favorite micro-scale custom racing circuit where drivers navigate across oversized desks, jumping between textbooks, rulers, and chalkboards in a giant classroom.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2018,
    sizeMB: 18,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "tracks/olivers-math-class",
    art: { from: "#1e3a8a", to: "#3b82f6", icon: "GraduationCap" },
    summary:
      "One of the most creative custom tracks in the STK add-ons repository, featuring micro-scale driving over school supplies.",
    changes:
      "Adds the Oliver's Math Class custom race track with custom collision meshes, shortcut ramps, and camera paths.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-cocoa-temple-2k",
    title: "Cocoa Temple 2K Track",
    tagline: "High-resolution jungle temple racing with ancient traps and waterfalls.",
    description:
      "An enhanced 2K remaster of the ancient Cocoa Temple track. Race through lush tropical rainforests, across crumbling stone bridges, and through glowing Mayan ruins.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2021,
    sizeMB: 28,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "tracks/cocoa-temple-2k",
    art: { from: "#14532d", to: "#15803d", icon: "Trees" },
    summary:
      "Rich jungle temple circuit featuring high-res textures, dynamic waterfall particle effects, and hazardous temple traps.",
    changes:
      "Adds the Cocoa Temple 2K race track with enhanced shaders, custom lighting, and jungle sound effects.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-snow-peak-circuit",
    title: "Snow Peak Circuit Track",
    tagline: "Snowy alpine mountain circuit with ice slides and hairpin drifts.",
    description:
      "A fast-paced winter track set high in alpine snow peaks. Features slippery ice turns, downhill jumps, and snowy pine tree slalom sections.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2019,
    sizeMB: 22,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "tracks/snow-peak-circuit",
    art: { from: "#0f172a", to: "#0284c7", icon: "Snowflake" },
    summary:
      "Alpine winter speedway with tight drift corners and slippery ice mechanics testing handling skills.",
    changes:
      "Adds the Snow Peak Circuit track with custom snow particles, icy drift physics surfaces, and alpine soundtrack.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-volcanic-island",
    title: "Volcanic Island Arena & Track",
    tagline: "Magma-filled caldera track and multiplayer battle arena.",
    description:
      "Race through active lava tunnels, over collapsing basalt bridges, and around an erupting volcano peak. Supports both standard circuit racing and multiplayer battle mode.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2020,
    sizeMB: 25,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "tracks/volcanic-island",
    art: { from: "#7f1d1d", to: "#ea580c", icon: "Flame" },
    summary:
      "Thrilling hazard-filled track and battle arena with lava geysers, crumbling bridges, and multiple alternate routes.",
    changes:
      "Adds Volcanic Island track and arena modes with custom magma shader effects and ambient volcano rumble audio.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-neon-highway",
    title: "Neon Highway Cyber Track",
    tagline: "Futuristic synthwave highway with speed booster strips and night city views.",
    description:
      "A glowing cyberpunk highway track with neon skyscrapers, high-speed tunnel sections, gravity-defying loops, and boost pads.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2022,
    sizeMB: 34,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "tracks/neon-highway",
    art: { from: "#581c87", to: "#ec4899", icon: "Zap" },
    summary:
      "Synthwave-inspired nighttime cityscape with glowing neon visuals and high-speed multi-lane racing.",
    changes:
      "Adds Neon Highway race track with custom glow materials, animated billboards, and synthwave music.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-tux-racer-3000",
    title: "Tux Racer 3000 Kart Model",
    tagline: "High-spec futuristic racing kart model for Tux.",
    description:
      "A custom-designed aerodynamic racing kart for Tux with glowing underglow effects, custom engine sound files, and animated jet thrusters during boost.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2021,
    sizeMB: 8,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "karts/tux-racer-3000",
    art: { from: "#1e293b", to: "#06b6d4", icon: "Rocket" },
    summary:
      "Sleek custom vehicle model for mascot Tux with custom exhaust animations and engine sounds.",
    changes:
      "Adds the Tux Racer 3000 playable kart model across all game modes with custom sound effects.",
    installHint: STK_HINT,
  }),
  ghMod({
    slug: "stk-subway-battle-arena",
    title: "Subway Station Battle Arena",
    tagline: "Multi-level underground subway arena for Three-Strikes Battle and Free-For-All.",
    description:
      "An urban multi-tier subway battle arena featuring train platforms, escalator ramps, and subterranean tunnels designed for chaotic item warfare in multiplayer.",
    baseGameSlug: "supertuxkart",
    developerSlug: "supertuxkart-team",
    baseTitle: "SuperTuxKart",
    license: "CC-BY-SA-4.0",
    releaseYear: 2020,
    sizeMB: 16,
    website: "https://github.com/supertuxkart/stk-addons",
    githubRepo: "supertuxkart/stk-addons",
    downloadKind: "github-zip",
    installRelativePath: "arenas/subway-battle-arena",
    art: { from: "#334155", to: "#64748b", icon: "Shield" },
    summary:
      "Tightly designed indoor arena with multiple floor levels and item spawn nodes for 2-8 player battle matches.",
    changes:
      "Adds the Subway Station battle arena to the multiplayer Three-Strikes, Free-For-All, and Capture-the-Flag modes.",
    installHint: STK_HINT,
  }),
];
